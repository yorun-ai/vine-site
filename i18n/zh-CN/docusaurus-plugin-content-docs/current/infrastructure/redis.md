---
slug: /redis
---

# Redis API

日常接入请先阅读 [使用 Redis](/docs/guide/redis)。本页说明 `infra/redis` 的完整配置、依赖注入、Cache 和 Locker API。

顶层 `infra/redis` 暴露 `Option`、`TypeAdder`、`RedisSpec`、`Redis`、`Locker`、`Lock`、`Cache[T]` 和 `NewCache[T](...)` 等公共类型。

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

- `Endpoint` 不能为空
- 支持完整 Redis URL，例如：
  - `redis://127.0.0.1:6379/0`
  - `redis://user:pass@127.0.0.1:6379/2`
- 也支持裸地址：
  - `127.0.0.1:6379`

`redis` 会优先调用 `go-redis` 的 `ParseURL(...)`；解析失败时退回裸地址模式。创建 client 时固定使用 Redis RESP2 协议，并关闭 identity 上报。

### `RedisSpec`

Redis 组件接口是：

```go
type RedisSpec interface {
    InitOption(option *Option)
    InitLockers(add TypeAdder)
    InitCaches(add TypeAdder)
}
```

其中：

- `InitOption(...)`：初始化 Redis 连接参数
- `InitLockers(...)`：声明这个 Redis 组件下可注入的 locker 类型
- `InitCaches(...)`：声明这个 Redis 组件下可注入的 cache 类型

业务组件通过嵌入 `redis.Redis` 获得该契约的默认实现。

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

## 初始化流程

应用启动时按以下顺序接入 Redis：

1. app 创建用户组件 `*CacheRedis`
2. 调用 `InitOption(...)`、`InitLockers(...)` 和 `InitCaches(...)`
3. 打开 Redis client，并将 `Cmdable` 提供给用户组件
4. 为已声明的 Locker 和 Cache 注册依赖注入工厂

## DI 语义

Vine 将用户声明的 Redis 组件作为单例提供给应用，并通过 factory 创建 Locker 和 Cache。每个 factory 会自动取得当前 `context.Context`，业务代码只需声明注入字段。

业务侧如果要直接操作 Redis，直接注入自己定义的 Redis 组件即可：

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
- 实现 `KeyPrefix() string`

例如：

```go
type UserLocker struct {
    redis.Locker
}

func (*UserLocker) KeyPrefix() string {
    return "lock:user"
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

如果不想通过注入声明 locker 类型，也可以直接：

```go
locker := cacheRedis.NewLocker(ctx, "lock:user")
```

如果需要运行时传入具体类型，也可以直接：

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
    defer lock.Unlock()

    select {
    case <-lock.Context().Done():
        return
    default:
    }

    // do work
}

```

这个示例里，实际 Redis key 会是：

```text
vine:lock:user:<userID>
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

Redis 基础设施错误会直接 panic，不走返回值。

实际 Redis key 规则是：

- 全局前缀固定为 `vine:lock:`
- 始终使用 `<KeyPrefix()> + ":" + key`

例如：

```go
lock, ok := userLocker.Lock("1")
if !ok {
    return
}
```

对应的 Redis key 是：

```text
vine:lock:lock:user:1
```

如果传空 key：

```go
lock, ok := userLocker.Lock("")
```

最终 Redis key 会是：

```text
vine:lock:lock:user:
```

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

这个 context 会在下面几种情况被 cancel：

- 手动 `lock.Unlock()`
- refresh 连续失败并最终判定失锁
- 应用或当前执行的父 context 被取消

如果业务逻辑需要感知“锁已经失效”，应该监听这个 context。

### refresh 策略

默认 refresh 行为：

- 正常 refresh 间隔：`10s`
- 失败后 retry 间隔：`3s`
- 最大 retry 次数：`7`

也就是说，一次正常 refresh tick 到来后：

1. 先立即尝试 refresh
2. 失败后按 `3s` 间隔继续重试
3. 连续失败到阈值，才认定锁失效

### broken 状态

如果 refresh 最终失败，这个 `Lock` 会进入 `broken` 状态。

此时：

- `IsBroken() == true`
- 不能再 `Unlock()`
- 这个 `Lock` 已经不可恢复

### 一次性语义

`Lock` 是一次性对象：

- `Locker` 是可复用的
- `Lock` 不可复用

也就是说：

- 需要新的加锁动作时，重新调用 `Locker.Lock(...)`
- 不存在对旧 `Lock` 做恢复或重新加锁的流程

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

### 直接创建 cache

如果不想通过注入声明 cache 类型，也可以直接：

```go
cache := redis.NewCache[*User](&cacheRedis.Redis, ctx, "user")
```

如果需要运行时传入具体类型，也可以直接：

```go
cache := cacheRedis.NewCacheByType(reflect.TypeFor[*UserCache](), ctx).(*UserCache)
```

### key 规则

实际 Redis key 规则是：

```text
vine:cache:<keyPrefix>:<key>
```

例如：

```text
vine:cache:user:1
```

`KeyPrefix()` 的默认规则和 `Locker` 一样：

- 默认情况下，每个 cache 类型都会基于完整类型名拿到唯一前缀
- 如果需要多个不同 cache 类型共享同一组 Redis key，必须显式覆写 `KeyPrefix()` 并返回相同值

## 使用建议

- Redis 组件统一嵌入 `redis.Redis`
- 优先把稳定前缀声明成注入式 locker
- 需要缓存时，通过 `InitCaches(...)` 声明注入式 cache，或用 `NewCache(...)` 直接创建
- 需要感知锁失效时，监听 `lock.Context()`
- `Lock` 一旦 broken，就丢弃它并重新走一次新的 `Locker.Lock(...)`
