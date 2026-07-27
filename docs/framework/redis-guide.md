---
slug: /guide/redis
---

# Redis

The Redis component provides `go-redis` commands, type-safe caches, and distributed lockers. An application only needs to declare the endpoint and the Cache/Locker types it wants to inject.

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

Business objects can inject `*MainRedis` to execute ordinary Redis commands, or inject a dedicated Cache or Locker:

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

    // Update user data
}
```

Locks have a TTL and refresh while held by default. `Lock.Context()` is canceled when the lock becomes invalid, so long-running work should monitor that context. See the [Redis Reference](/docs/redis) for Cache, KeyPrefix, lock states, and direct construction.
