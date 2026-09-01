---
slug: /guide/redis
sidebar_label: Redis
---

# Redis

Redis 组件提供 `go-redis` 命令、类型安全 Cache 和分布式 Locker。应用只需声明 endpoint 以及需要注入的 Cache/Locker 类型。

```go title="redis.go"
type User struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}

type UserCache struct {
    redis.Cache[*User]
}

type UserLocker struct {
    redis.Locker
}

type MainRedis struct {
    redis.Redis
}

func (*MainRedis) InitOption(option *redis.Option) {
    option.Endpoint = "redis://127.0.0.1:6379/0"
}

func (*MainRedis) InitLockers(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserLocker]())
}

func (*MainRedis) InitCaches(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserCache]())
}
```

```go title="app.go"
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainRedis]())
}
```

业务对象能注入 `*MainRedis` 执行普通 Redis 命令，也能注入专用 Cache 或 Locker：

:::tip 原子安全解锁

当失锁是正常情况时，使用 `TryUnlock()`。它把本地状态检查与带 token 校验的
Redis 释放合并成一次操作；Redis 命令失败仍然 panic。

:::

```go title="service.go"
type UserService struct {
    Cache  *UserCache  `inject:""`
    Locker *UserLocker `inject:""`
}

func (s *UserService) Load(userID string) (*User, bool) {
    return s.Cache.Get(userID)
}

func (s *UserService) Rebuild(userID string) {
    lock, ok := s.Locker.Lock(userID)
    if !ok {
        return
    }

    // 锁 context 被取消时返回 false。
    if !s.rebuildWhileOwned(lock.Context(), userID) {
        return
    }
    if !lock.TryUnlock() {
        return
    }
}
```

Cache 和 Locker 默认根据完整 Go 类型生成前缀。只有当两个类型确实需要共享
同一个 Redis 命名空间时，才应覆盖 `KeyPrefix`。

锁默认带 TTL，持有期间会自动续期。所有权一旦失效，`Lock.Context()` 会被取消，
长任务必须响应这个 context。后台 refresh 失败会把锁标记为 broken，原因可通过
`context.Cause(lock.Context())` 取得；refresh goroutine 本身不会 panic。失效的锁
不再属于当前持有者，调用 `Unlock` 会 panic；所以对可能超过租约的工作，不要
无条件地 `defer lock.Unlock()`。`IsBroken()` 只是一次状态观测，不能原子地保证
随后的 `Unlock()` 不 panic。需要原子地检查状态并做带 token 校验的释放时，用
`TryUnlock()`；锁不可用或所有权丢失时返回 `false`。Redis 锁是协调租约，不提供
fencing token。
`Lock(...)` 或 `Unlock()` 同步调用中的 Redis 错误会 panic；如果 `Unlock()` 带
token 校验的删除发现所有权已经丢失，也会 panic。Cache、KeyPrefix、
锁状态和直接创建方式见 [Redis 参考](../infrastructure/redis.md)。
