---
slug: /guide/redis
sidebar_label: Redis
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

Business objects can inject `*MainRedis` to execute ordinary Redis commands, or inject a dedicated Cache or Locker:

:::tip Atomic safe-unlock

Use `TryUnlock()` when losing the lock is a normal case. It combines the local
state check and the token-checked Redis release into one operation. Redis command
failures still panic.

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

    // Return false when the lock context is canceled.
    if !s.rebuildWhileOwned(lock.Context(), userID) {
        return
    }
    if !lock.TryUnlock() {
        return
    }
}
```

Cache and Locker prefixes are derived from their full Go types by default. Override
`KeyPrefix` only when two types intentionally need the same Redis namespace.

Locks have a TTL and refresh while held by default. `Lock.Context()` is canceled
when ownership becomes invalid, so long-running work must stop on that context.
A background refresh failure marks the lock broken; the cause is available
through `context.Cause(lock.Context())`, and the refresh goroutine itself does
not panic. A broken lock is no longer owned and `Unlock` panics, so don't use an
unconditional `defer lock.Unlock()` around work that can outlive the lease.
`IsBroken()` is a one-time state observation, not a guarantee that a following
`Unlock()` won't panic. Use `TryUnlock()` for an atomic state check plus
token-checked release; it returns `false` when the lock is unavailable or
ownership is lost. Redis locks are coordination leases, not fencing tokens.
Synchronous Redis failures from `Lock(...)` or `Unlock()` panic; `Unlock()` also
panics when its token-checked delete finds ownership is already gone.
See the [Redis Reference](../infrastructure/redis.md) for Cache, KeyPrefix, lock states, and
direct construction.
