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

:::caution fail-fast 解锁

下面示例中的 `IsBroken()` 预检查只是尽力而为，无法原子地安全解锁：`refresh`
可能在 `IsBroken()` 返回之后把锁标成 broken，随后的 `Unlock()` 依然会 panic。
当前 API 没有 `TryUnlock`。

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
    if lock.IsBroken() {
        return
    }
    // 这里只是尽力而为的预检查，所有权仍可能在此刻变化。
    lock.Unlock()
}
```

Cache 和 Locker 默认根据完整 Go 类型生成前缀。只有当两个类型确实需要共享
同一个 Redis 命名空间时，才应覆盖 `KeyPrefix`。

锁默认带 TTL，持有期间会自动续期。所有权一旦失效，`Lock.Context()` 会被取消，
长任务必须响应这个 context。失效的锁不再属于当前持有者，调用 `Unlock` 会
panic；所以对可能超过租约的工作，不要无条件地 `defer lock.Unlock()`。是否加 `IsBroken()` 检查由你决定：它只是想释放一个可能已 broken 的锁时避免 panic，但并非必需——如果临界区会在租约内结束，或已经响应 `Lock.Context()` 停止，可以不加，直接依赖 fail-fast。
`IsBroken` 只是一次状态观测，不能原子地保证随后的 `Unlock` 不 panic——锁可能
在两次调用之间失效，而当前 API 恰好没有 `TryUnlock`。如果无法接受这种
fail-fast 契约，就把它隔离在应用自己的 recovery/error 边界里，或改用具备所需
语义的锁 API。Redis 锁是协调租约，不提供 fencing token。Cache、KeyPrefix、
锁状态和直接创建方式见 [Redis 参考](../infrastructure/redis.md)。
