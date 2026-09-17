---
slug: /redis
sidebar_label: Redis API
---

# Redis API

Start with [Using Redis](../framework/redis-guide.md) to add Redis to an
application. Use this reference for the exact component, Cache, Locker, and
lock-invalidation behavior exposed by `infra/redis`.

The top-level `infra/redis` package exposes public types including `Option`,
`TypeAdder`, `RedisSpec`, `Redis`, `Locker`, `Lock`, and `Cache[T]`. Caches are
created through methods on `Redis`, not through a package-level constructor.

`redis` doesn't rewrap the `go-redis` command set. Instead, it provides a
consistent integration layer that:

- Opens a Redis connection.
- Attaches the `go-redis` `Cmdable` to an application framework component.
- Integrates with DI through the application component mechanism.
- Provides an injectable `Locker`.
- Provides one-shot `Lock` objects.
- Provides an injectable generic `Cache[T]`.

## Core Types

### `Option`

```go
type Option struct {
    Endpoint string
}
```

- `Endpoint` cannot be empty.
- Full Redis URLs are supported, for example:
  - `redis://127.0.0.1:6379/0`
  - `redis://user:pass@127.0.0.1:6379/2`
- Plain addresses are also supported:
  - `127.0.0.1:6379`

### `RedisSpec`

A business component embeds `redis.Redis` and implements `InitOption`,
`InitLockers`, and `InitCaches` as shown below.

### `Redis`

`redis.Redis` already includes application lifecycle support and the `go-redis`
`Cmdable`. A business component only needs to embed it and supply connection
configuration:

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

Then declare the component in the application:

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*CacheRedis]())
}
```

## DI Semantics

Declare an injected field for the Cache or Locker a business object uses.

To execute Redis commands directly in business code, inject your own Redis
component:

```go
type UserService struct {
    CacheRedis *CacheRedis `inject:""`
}
```

Then call `go-redis` commands directly:

```go
value, err := s.CacheRedis.Get(ctx, "user:1").Result()
```

## Lifecycle

The Redis client is created when the component starts and closed after the
application stops. Caches, Lockers, and user-defined Redis components all share
this client; business modules don't need to open duplicate connections or close
it manually.

## Locker

### Defining a Locker

An injectable locker must:

- Embed `redis.Locker`.
- Optionally override `KeyPrefix() string` when it needs an explicit shared
  namespace.

For example:

```go
type UserLocker struct {
    redis.Locker
}

func (*UserLocker) KeyPrefix() string {
    return "user"
}
```

How `KeyPrefix()` works:

- By default, every locker type gets a unique prefix derived from its fully
  qualified type name.
- To let multiple locker types operate on the same Redis lock, explicitly
  override `KeyPrefix()` and return the same value from each type.

Declare the locker in the Redis component:

```go
func (*CacheRedis) InitLockers(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserLocker]())
}
```

Business code can then inject it directly:

```go
type UserService struct {
    UserLocker *UserLocker `inject:""`
}
```

### Creating a Locker Directly

If you don't want to declare a locker type for injection, create one directly:

```go
locker := cacheRedis.NewLocker(ctx, "user")
```

You can also provide a concrete type at runtime:

```go
locker := cacheRedis.NewLockerByType(reflect.TypeFor[*UserLocker](), ctx).(*UserLocker)
```

### Complete Example

Here's an injectable locker example.

First, define the Redis component:

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

Then define the locker:

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

Register the Redis component with the application:

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

Finally, inject and use the locker in business code:

:::tip Atomic safe-unlock

Use `TryUnlock()` when losing the lock is a normal case. It combines the local
lock-state check and the token-checked Redis release into one operation. Redis
command failures still panic per the infrastructure fail-fast policy.

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

The public call is:

```go
lock, ok := locker.Lock(key)
```

Return values:

- `(*Lock, true)`: the lock was acquired.
- `(*Lock, false)`: another holder already owns the lock.

Redis infrastructure errors in synchronous `Lock(...)` and `Unlock()` calls
panic rather than being returned. Lock contention is not an infrastructure
error, so it remains the `false` return case.

### Default Lock

`Locker.Lock(...)` defaults to:

- `timeout = 30s`
- Automatic refresh.

So the underlying lock always has a TTL, but Vine renews it automatically while
it is held.

### `Lock.Context()`

Every successful `Locker.Lock(...)` call creates a lock-scoped context:

```go
lock, ok := userLocker.Lock("1")
if !ok {
    return
}
ctx := lock.Context()
```

This context is canceled when:

- You call `lock.Unlock()` manually.
- Redis reports that the refresh token is no longer the current owner.
- A refresh command or its next retry cannot complete before the conservative
  local lease deadline.
- The application or the current execution's parent context is canceled.

Listen to this context when business logic needs to detect that a lock is no
longer valid. When background refresh breaks the lock, `context.Cause(ctx)`
contains the ownership, lease, or Redis refresh failure that caused the
cancellation. A successful manual `Unlock()` cancels the context with the
ordinary `context.Canceled` cause.

### Renewal

A held lock renews itself for as long as you keep it, so the lease does not
expire under a long-running critical section. When renewal can no longer reach
Redis, or Redis reports that another holder owns the lock, Vine marks the lock
broken and cancels `Lock.Context()`.

### Broken State

If refresh ultimately fails, the `Lock` enters the `broken` state.

At that point:

- `IsBroken() == true`.
- `context.Cause(lock.Context())` reports why the lock broke.
- Calling `Unlock()` panics with that cause.
- The `Lock` cannot recover.

For a lock that is still locally valid, `Unlock()` performs a token-checked
Redis delete. A Redis command failure or a result other than `1` marks the lock
broken, cancels its context with the failure, and panics synchronously. A result
of `0` means the token is no longer the owner; it is not treated as a successful
or idempotent unlock.

`IsBroken()` reports a snapshot. It doesn't reserve the lock or synchronize a
following `Unlock()`: refresh can mark the lock broken between the two calls.
`TryUnlock()` is the safe replacement for that two-call pattern—it returns `false`
when the lock was not acquired, is already released or broken, or its token no
longer owns the Redis key; Redis command errors still panic. Keep the critical
section bounded, stop work when `Lock.Context()` is canceled, and use `Unlock()`
when lock loss should stay a fail-fast boundary.

### `Lock.TryUnlock()`

`TryUnlock()` performs the state check and the token-checked release atomically,
with these outcomes:

- `true`: this token owned the lock and released it.
- `false`: the lock was never acquired, was already released or broken, or is no
  longer owned by this token.
- Panic: Redis could not execute the release command.

An ownership-mismatch result marks the lock broken and cancels its context with
the ownership-loss cause before returning `false`.

### One-Shot Semantics

A `Lock` is a one-shot object:

- A `Locker` is reusable.
- A `Lock` is not reusable.

Therefore:

- Call `Locker.Lock(...)` again for each new acquisition.
- An old `Lock` cannot be recovered or reacquired.

## Cache

Like `Locker`, `Cache[T]` is an injectable Redis handle.

### Defining a Cache

An injectable cache must:

- Embed `redis.Cache[T]`.
- Optionally override `KeyPrefix() string`.

For example:

```go
type UserCache struct {
    redis.Cache[*User]
}

func (*UserCache) KeyPrefix() string {
    return "user"
}
```

Declare it in the Redis component:

```go
func (*CacheRedis) InitCaches(add redis.TypeAdder) {
    add(reflect.TypeFor[*UserCache]())
}
```

### Usage Example

Inject the cache into business code:

```go
type UserService struct {
    UserCache *UserCache `inject:""`
}
```

Then use it directly:

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

`GetOrLoad` is a convenience sequence of get, load, and set. It doesn't
singleflight concurrent misses: several executions can run `load` for the same
key at once. Add application-level request coalescing or another cache-stampede
strategy when duplicate loads are expensive.

### Creating a Cache Directly

If you don't want to declare a cache type for injection, create one directly:

```go
cache := cacheRedis.NewCache[*User](ctx, "user")
```

You can also provide a concrete type at runtime:

```go
cache := cacheRedis.NewCacheByType(reflect.TypeFor[*UserCache](), ctx).(*UserCache)
```

### Key Rules

`KeyPrefix()` follows the same rules as for `Locker`:

- By default, every cache type gets a unique prefix.
- To let multiple cache types share the same entries, override `KeyPrefix()` and
  return the same value from each type.

## Cache and lock rules

- Embed `redis.Redis` consistently in Redis components.
- Prefer injectable lockers for stable key prefixes.
- Declare injectable caches through `InitCaches(...)`, or create one directly
  with `NewCache(...)`.
- Listen to `lock.Context()` when you need to detect lock invalidation.
- Once a `Lock` is broken, discard it and acquire a new one through
  `Locker.Lock(...)`.
- Use `TryUnlock()` instead of `IsBroken()` followed by `Unlock()` when lock
  loss should return `false` rather than panic.
