---
slug: /guide/redis
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

func (*UserCache) KeyPrefix() string { return "user" }

type UserLocker struct {
    redis.Locker
}

func (*UserLocker) KeyPrefix() string { return "user" }

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

业务对象可以注入 `*MainRedis` 执行普通 Redis 命令，也可以注入专用 Cache 或 Locker：

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
    defer lock.Unlock()

    // 更新用户数据
}
```

默认锁带 TTL 并在持有期间续期；`Lock.Context()` 会在锁失效时取消，长任务应监听该 context。Cache、KeyPrefix、锁状态和直接创建方式见 [Redis 参考](/docs/redis)。
