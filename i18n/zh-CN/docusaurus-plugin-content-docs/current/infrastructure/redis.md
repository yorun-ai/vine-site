---
slug: /redis
sidebar_label: Redis API
---

# Redis API

把 Redis 接进应用时，先看[使用 Redis](../framework/redis-guide.md)。需要确认 component、
Cache、Locker 或锁失效的精确行为时，再查这里的 `infra/redis` API。

顶层 `infra/redis` 暴露 `Option`、`TypeAdder`、`RedisSpec`、`Redis`、`Locker`、`Lock` 和 `Cache[T]` 等公共类型。cache 通过 `Redis` 上的方法创建，没有包级构造函数。

`redis` 的定位不是重新封装 `go-redis` 命令集，而是提供一层统一接入：

- 打开 Redis 连接
- 将 `go-redis` 的 `Cmdable` 挂到 app framework component 上
- 通过 app component 机制接入 DI
- 提供可注入的 `Locker`
- 提供一次性 `Lock`
- 提供可注入的泛型 `Cache[T]`

## 核心类型

### `Option`

```go
type Option struct {
    Endpoint string
}
```

规则：

- `Endpoint` 必须非空
- 支持完整 Redis URL，例如：
  - `redis://127.0.0.1:6379/0`
  - `redis://user:pass@127.0.0.1:6379/2`
- 也支持裸地址：
  - `127.0.0.1:6379`


### `RedisSpec`

业务组件通过嵌入 `redis.Redis`，并按下方示例实现 `InitOption`、`InitLockers` 和
`InitCaches`。

### `Redis`

`redis.Redis` 已包含应用生命周期和 `go-redis` 的 `Cmdable`。业务组件只需要嵌入它并提供连接配置：

```go
type CacheRedis struct {
    redis.Redis
}

func (*CacheRedis) InitOption(option *redis.Option) {
    option.Endpoint = "redis://127.0.0.1:6379/0"
}

func (*CacheRedis) InitLockers(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserLocker]())
}

func (*CacheRedis) InitCaches(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserCache]())
}
```

然后在 app 中声明组件：

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*CacheRedis]())
}
```

## DI 语义

业务对象只需声明注入字段。

业务侧要直接操作 Redis，注入自己定义的 Redis 组件即可：

```go
type UserService struct {
    CacheRedis *CacheRedis `inject:""`
}
```

然后直接调用 `go-redis` 命令：

```go
value, err := s.CacheRedis.Get(ctx, "user:1").Result()
```

## 生命周期

Redis client 在组件启动时创建，在应用停止后关闭。Cache、Locker 和用户定义的 Redis 组件共享该 client；无需在业务模块中重复连接或手工关闭。

## Locker

### 定义 locker

注入式 locker 需要：

- 嵌入 `redis.Locker`
- 只在需要显式共享命名空间时覆盖 `KeyPrefix() string`

例如：

```go
type UserLocker struct {
    redis.Locker
}

func (*UserLocker) KeyPrefix() string {
    return "user"
}
```

`KeyPrefix()` 的规则是：

- 默认情况下，每个 locker 类型都会基于完整类型名拿到唯一前缀
- 如果需要多个不同 locker 类型操作同一把 Redis 锁，必须显式覆写 `KeyPrefix()` 并返回相同值

然后在 Redis 组件里声明：

```go
func (*CacheRedis) InitLockers(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserLocker]())
}
```

这样业务里就可以直接注入：

```go
type UserService struct {
    UserLocker *UserLocker `inject:""`
}
```

### 直接创建 locker

如果不想通过注入声明 locker 类型，可直接：

```go
locker := cacheRedis.NewLocker(ctx, "user")
```

如果需要运行时传入具体类型，可直接：

```go
locker := cacheRedis.NewLockerByType(reflect.TypeFor[*UserLocker](), ctx).(*UserLocker)
```

### 完整示例

下面是一个完整的可注入 locker 示例。

先定义 Redis 组件：

```go
package demo

import (
    "reflect"

    "go.yorun.ai/vine/app"
    vineredis "go.yorun.ai/vine/infra/redis"
)

type CacheRedis struct {
    vineredis.Redis
}

func (*CacheRedis) InitOption(option *vineredis.Option) {
    option.Endpoint = "redis://127.0.0.1:6379/0"
}

func (*CacheRedis) InitLockers(add vineredis.TypeAdder) {
    add(reflect.TypeFor[*UserLocker]())
}
```

再定义 locker：

```go
package demo

import vineredis "go.yorun.ai/vine/infra/redis"

type UserLocker struct {
    vineredis.Locker
}

func (*UserLocker) KeyPrefix() string {
    return "user"
}
```

然后在 app 里注册 Redis 组件：

```go
package demo

import "go.yorun.ai/vine/app"

type DemoApp struct {
    app.Application
}

func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*CacheRedis]())
}
```

最后在业务里注入并使用：

:::tip 原子安全解锁

当失锁是正常情况时，使用 `TryUnlock()`。它把本地状态检查与带 token 校验的
Redis 释放合并成一次操作。Redis 命令失败仍遵循基础设施 fail-fast 原则 panic。

:::

```go
package demo

type UserService struct {
    UserLocker *UserLocker `inject:""`
}

func (s *UserService) RebuildUser(userID string) {
    lock, ok := s.UserLocker.Lock(userID)
    if !ok {
        return
    }
    if !s.rebuildWhileOwned(lock.Context(), userID) {
        return
    }
    if !lock.TryUnlock() {
        return
    }
}

```

## Lock

### `Locker.Lock(...)`

公共调用方式：

```go
lock, ok := locker.Lock(key)
```

返回值语义：

- `(*Lock, true)`：成功拿到锁
- `(*Lock, false)`：锁已被别人持有

同步 `Lock(...)` 和 `Unlock()` 调用中的 Redis 基础设施错误会直接 panic，不走
返回值。锁竞争不是基础设施错误，因此仍使用 `false` 返回值。

### 默认锁

默认 `Locker.Lock(...)` 的行为是：

- `timeout = 30s`
- 自动 refresh

也就是说，底层始终是**带 TTL 的锁**，只是持有期间会自动续期。

### `Lock.Context()`

每次 `Locker.Lock(...)` 成功后，得到的 `Lock` 都会生成一个锁级 context：

```go
lock, ok := userLocker.Lock("1")
if !ok {
    return
}
ctx := lock.Context()
```

在以下情况下，这个 context 会被 cancel：

- 手动调用 `lock.Unlock()`
- Redis 返回结果表明 refresh token 已不属于当前持有者
- refresh 命令或下一次 retry 无法在保守的本地租约截止点前完成
- 应用或当前执行的父 context 被取消

如果业务逻辑需要感知“锁已经失效”，应该监听这个 context。后台 refresh 把锁
标记为 broken 时，`context.Cause(ctx)` 会给出导致取消的所有权、租约或 Redis
refresh 失败原因。手动成功调用 `Unlock()` 时，cause 是普通的
`context.Canceled`。

### 续约

持锁期间锁会自动续约，因此长时间运行的临界区不会因为租约到期而失效。当续约无法
再触达 Redis，或 Redis 报告锁已由其他持有者持有时，Vine 会把锁标记为 broken，并
取消 `Lock.Context()`。

### broken 状态

如果 refresh 最终失败，这个 `Lock` 会进入 `broken` 状态。

此时：

- `IsBroken() == true`
- `context.Cause(lock.Context())` 会报告锁失效的原因
- 调用 `Unlock()` 会携带这个原因 panic
- 这个 `Lock` 已经不可恢复

对于本地仍有效的锁，`Unlock()` 会执行带 token 校验的 Redis 删除。Redis 命令
失败或返回值不是 `1` 时，会把锁标记为 broken，以失败原因取消锁 context，并在
同步调用路径 panic。返回 `0` 表示 token 已不再是锁的持有者，不会被当作成功或
幂等解锁。

`IsBroken()` 只是一次状态快照；它不会保留锁，也不会与随后的 `Unlock()` 原子
同步。refresh 可能在两次调用之间把锁标成 broken。原子的 `TryUnlock()` 是这类
两步调用的安全替代：锁未获取、已释放、已 broken 或已不再由当前 token 持有时
返回 `false`，Redis 命令错误仍然 panic。建议限制临界区时长，在
`Lock.Context()` 取消后立即停止工作；需要 fail-fast 时用 `Unlock()`，把失锁当作
预期情况时用 `TryUnlock()`。

### `Lock.TryUnlock()`

`TryUnlock()` 原子地完成状态检查与带 token 校验的释放，结果有三种：

- `true`：当前 token 持有锁，并已释放
- `false`：锁未获取、已释放、已 broken，或已不再由当前 token 持有
- panic：Redis 无法执行释放命令

所有权不匹配时，方法会先把锁标记为 broken，并用所有权丢失原因取消锁 context，
再返回 `false`。

### 一次性语义

`Lock` 是一次性对象：

- `Locker` 是可复用的
- `Lock` 不可复用

也就是说：

- 需要新的加锁动作时，重新调用 `Locker.Lock(...)`
- 旧的 `Lock` 无法恢复，也不能重新加锁

## Cache

`Cache[T]` 和 `Locker` 一样，也是一个可注入的 Redis 句柄。

### 定义 cache

注入式 cache 需要：

- 嵌入 `redis.Cache[T]`
- 可选地覆写 `KeyPrefix() string`

例如：

```go
type UserCache struct {
    redis.Cache[*User]
}

func (*UserCache) KeyPrefix() string {
    return "user"
}
```

然后在 Redis 组件里声明：

```go
func (*CacheRedis) InitCaches(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserCache]())
}
```

### 使用示例

业务里直接注入：

```go
type UserService struct {
    UserCache *UserCache `inject:""`
}
```

然后直接：

```go
user, ok := s.UserCache.Get("1")
if !ok {
    return
}

s.UserCache.Set("1", user, time.Minute)
s.UserCache.Delete("1")
user = s.UserCache.GetOrLoad("1", time.Minute, func() *User {
    return repo.LoadUser("1")
})
```

`GetOrLoad` 只是依次执行 get、load 和 set，并不会合并同一个 key 的并发 miss；
多个 execution 可能同时执行 `load`。如果重复回源代价较高，建议在应用层增加
singleflight 或其他防止缓存击穿的机制。

### 直接创建 cache

如果不想通过注入声明 cache 类型，可直接：

```go
cache := cacheRedis.NewCache[*User](ctx, "user")
```

如果需要运行时传入具体类型，可直接：

```go
cache := cacheRedis.NewCacheByType(reflect.TypeFor[*UserCache](), ctx).(*UserCache)
```

### key 规则

`KeyPrefix()` 的默认规则和 `Locker` 一样：

- 默认情况下，每个 cache 类型都会拿到唯一前缀
- 如果需要多个不同 cache 类型共享同一组条目，必须显式覆写 `KeyPrefix()` 并返回相同值

## Cache 与锁的使用规则

- Redis 组件统一嵌入 `redis.Redis`
- 优先把稳定前缀声明成注入式 locker
- 需要缓存时，通过 `InitCaches(...)` 声明注入式 cache，或用 `Redis.NewCache(...)` 直接创建
- 需要感知锁失效时，监听 `lock.Context()`
- `Lock` 一旦 broken，就丢弃它并重新走一次新的 `Locker.Lock(...)`
- 失锁应返回 `false` 而不是 panic 时，使用 `TryUnlock()`，不要组合
  `IsBroken()` 与 `Unlock()`
