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

:::caution Fail-fast unlock

The pre-check below is best effort, not an atomic safe-unlock operation.
`Unlock()` can still panic if refresh marks the lock broken after `IsBroken()`
returns. The current API has no `TryUnlock`.

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
    if lock.IsBroken() {
        return
    }
    // Best-effort pre-check only: ownership can still change here.
    lock.Unlock()
}
```

Cache and Locker prefixes are derived from their full Go types by default. Override
`KeyPrefix` only when two types intentionally need the same Redis namespace.

Locks have a TTL and refresh while held by default. `Lock.Context()` is canceled
when ownership becomes invalid, so long-running work must stop on that context.
A broken lock is no longer owned and `Unlock` will panic; avoid an unconditional
`defer lock.Unlock()` around work that can outlive the lease. Whether to add the `IsBroken()` check is up to you: it lets you release a possibly-broken lock without the panic, but it's optional—if the critical section ends within the lease or you already stop on `Lock.Context()`, fail-fast alone is fine. `IsBroken` is a
state observation, not an atomic promise that a following `Unlock` cannot
panic—the lock can break between those calls, and the current API has no
`TryUnlock`. If that fail-fast contract is not acceptable, isolate it behind
an application-owned recovery/error boundary or choose a lock API with the
required semantics. Redis locks are coordination leases, not fencing tokens.
See the [Redis Reference](../infrastructure/redis.md) for Cache, KeyPrefix, lock states, and
direct construction.
