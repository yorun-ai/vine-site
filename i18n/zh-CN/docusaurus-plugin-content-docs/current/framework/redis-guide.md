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
`context.Cause(lock.Context())` 取得。失效的锁不再属于当前持有者，调用 `Unlock`
会 panic；所以对可能超过租约的工作，不要无条件地 `defer lock.Unlock()`。`IsBroken()` 只是一次状态观测，不能原子地保证
随后的 `Unlock()` 不 panic。需要原子地检查状态并做带 token 校验的释放时，用
`TryUnlock()`；锁不可用或所有权丢失时返回 `false`。Redis 锁是协调租约，不提供
fencing token。
`Lock(...)` 或 `Unlock()` 同步调用中的 Redis 错误会 panic；如果 `Unlock()` 带
token 校验的删除发现所有权已经丢失，也会 panic。

## 内存 Redis

`redis+memory://cache` 由进程内的内存实例提供缓存与锁，无需外部服务，所有运行模式
（含各自的 bundled 形式）都可用。名称允许字母、数字、`_`、`-`、`.`；可选的数据库编号
（`0`–`15`）用于选择逻辑数据库，省略时为 DB 0。连接串不接受凭据、端口、额外路径段或
查询参数。

同一进程内，相同名称共享一个服务端，相同名称和数据库编号共享一个客户端连接池。
`Cache[T]` 与 `Locker` 的用法与外部 Redis 一致，包括 key 过期和锁续租。组件停止时释放
自己的引用：某个数据库的最后一个引用释放后关闭该数据库的 client，只要还有别的数据库
引用该实例，其数据就保留；实例的最后一个引用释放后，实例关闭并丢弃数据，之后再次获取
会从空实例开始。

该实例只存在于创建它的进程内，因此不同进程即使使用相同连接串也不会共享缓存或锁。
多副本部署如需共享缓存或协调锁，必须使用外部 Redis（`redis://` 或 `rediss://`）。
该后端覆盖上述 API 使用的命令，不等同于完整的 Redis 命令集。

Cache、KeyPrefix、锁状态和直接创建方式见 [Redis 参考](../infrastructure/redis.md)。
