---
slug: /redis
---

# Redis API Reference

For day-to-day integration, start with [Using Redis](/docs/guide/redis). This page documents the complete configuration, dependency injection, Cache, and Locker APIs provided by `infra/redis`.

The top-level `infra/redis` package exposes public types including `Option`, `TypeAdder`, `RedisSpec`, `Redis`, `Locker`, `Lock`, `Cache[T]`, and `NewCache[T](...)`.

`redis` does not rewrap the `go-redis` command set. It provides a consistent integration layer that:

- Opens a Redis connection.
- Attaches the `go-redis` `Cmdable` to an application framework component.
- Integrates with DI through the application component mechanism.
- Provides an injectable `Locker`.
- Provides one-shot `Lock` objects.
- Provides an injectable generic `Cache[T]`.

## 1. Core Types

### 1.1 `Option`

```go
type Option struct {
    Endpoint string
}
```

Rules:

- `Endpoint` cannot be empty.
- Full Redis URLs are supported, for example:
  - `redis://127.0.0.1:6379/0`
  - `redis://user:pass@127.0.0.1:6379/2`
- Plain addresses are also supported:
  - `127.0.0.1:6379`

`redis` first calls `go-redis`'s `ParseURL(...)`. If parsing fails, it falls back to plain-address mode. The client always uses the Redis RESP2 protocol and disables identity reporting.

### 1.2 `RedisSpec`

The Redis component interface is:

```go
type RedisSpec interface {
    InitOption(option *Option)
    InitLockers(add TypeAdder)
    InitCaches(add TypeAdder)
}
```

Its methods have these roles:

- `InitOption(...)`: initializes Redis connection options.
- `InitLockers(...)`: declares injectable locker types for this Redis component.
- `InitCaches(...)`: declares injectable cache types for this Redis component.

A business component receives the default implementation of this contract by embedding `redis.Redis`.

### 1.3 `Redis`

`redis.Redis` already includes application lifecycle support and the `go-redis` `Cmdable`. A business component only needs to embed it and supply connection configuration:

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

## 2. Initialization Flow

The application integrates Redis in this order during startup:

1. The application creates the user component `*CacheRedis`.
2. It calls `InitOption(...)`, `InitLockers(...)`, and `InitCaches(...)`.
3. It opens the Redis client and provides `Cmdable` to the user component.
4. It registers dependency-injection factories for the declared Lockers and Caches.

## 3. DI Semantics

Vine provides the user-declared Redis component to the application as a singleton and creates Lockers and Caches through factories. Each factory automatically receives the current `context.Context`; business code only needs to declare an injected field.

To execute Redis commands directly in business code, inject your own Redis component:

```go
type UserService struct {
    CacheRedis *CacheRedis `inject:""`
}
```

Then call `go-redis` commands directly:

```go
value, err := s.CacheRedis.Get(ctx, "user:1").Result()
```

## 4. Lifecycle

The Redis client is created when the component starts and closed after the application stops. Caches, Lockers, and user-defined Redis components share this client; business modules do not need to open duplicate connections or close it manually.

## 5. Locker

### 5.1 Defining a Locker

An injectable locker must:

- Embed `redis.Locker`.
- Implement `KeyPrefix() string`.

For example:

```go
type UserLocker struct {
    redis.Locker
}

func (*UserLocker) KeyPrefix() string {
    return "lock:user"
}
```

`KeyPrefix()` follows these rules:

- By default, every locker type receives a unique prefix derived from its fully qualified type name.
- To let multiple locker types operate on the same Redis lock, explicitly override `KeyPrefix()` and return the same value from each type.

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

### 5.2 Creating a Locker Directly

If you do not want to declare a locker type for injection, create one directly:

```go
locker := cacheRedis.NewLocker(ctx, "lock:user")
```

You can also provide a concrete type at runtime:

```go
locker := cacheRedis.NewLockerByType(reflect.TypeFor[*UserLocker](), ctx).(*UserLocker)
```

### 5.3 Complete Example

The following example defines an injectable locker.

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

In this example, the actual Redis key is:

```text
vine:lock:user:<userID>
```

## 6. Lock

### 6.1 `Locker.Lock(...)`

The public call is:

```go
lock, ok := locker.Lock(key)
```

The return values mean:

- `(*Lock, true)`: the lock was acquired.
- `(*Lock, false)`: another holder already owns the lock.

Redis infrastructure errors panic instead of being returned.

Actual Redis keys follow these rules:

- The global prefix is always `vine:lock:`.
- The remaining key is always `<KeyPrefix()> + ":" + key`.

For example:

```go
lock, ok := userLocker.Lock("1")
if !ok {
    return
}
```

The corresponding Redis key is:

```text
vine:lock:lock:user:1
```

If you pass an empty key:

```go
lock, ok := userLocker.Lock("")
```

The final Redis key is:

```text
vine:lock:lock:user:
```

### 6.2 Default Lock

By default, `Locker.Lock(...)` uses:

- `timeout = 30s`
- Automatic refresh.

The underlying lock therefore always has a TTL, but Vine renews it automatically while it is held.

### 6.3 `Lock.Context()`

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
- Refresh fails repeatedly and the lock is ultimately considered lost.
- The application or the current execution's parent context is canceled.

Listen to this context when business logic needs to detect that a lock is no longer valid.

### 6.4 Refresh Policy

The default refresh policy is:

- Normal refresh interval: `10s`.
- Retry interval after a failure: `3s`.
- Maximum retry count: `7`.

When a normal refresh tick occurs:

1. Vine attempts a refresh immediately.
2. If it fails, Vine retries every `3s`.
3. Vine considers the lock lost only after the retry threshold is reached.

### 6.5 Broken State

If refresh ultimately fails, the `Lock` enters the `broken` state.

At that point:

- `IsBroken() == true`.
- You cannot call `Unlock()` again.
- The `Lock` cannot recover.

### 6.6 One-Shot Semantics

A `Lock` is a one-shot object:

- A `Locker` is reusable.
- A `Lock` is not reusable.

Therefore:

- Call `Locker.Lock(...)` again for each new acquisition.
- An old `Lock` cannot be recovered or reacquired.

## 7. Cache

Like `Locker`, `Cache[T]` is an injectable Redis handle.

### 7.1 Defining a Cache

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

### 7.2 Usage Example

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

### 7.3 Creating a Cache Directly

If you do not want to declare a cache type for injection, create one directly:

```go
cache := redis.NewCache[*User](&cacheRedis.Redis, ctx, "user")
```

You can also provide a concrete type at runtime:

```go
cache := cacheRedis.NewCacheByType(reflect.TypeFor[*UserCache](), ctx).(*UserCache)
```

### 7.4 Key Rules

Actual Redis keys have this form:

```text
vine:cache:<keyPrefix>:<key>
```

For example:

```text
vine:cache:user:1
```

The default `KeyPrefix()` rules match those for `Locker`:

- By default, every cache type receives a unique prefix derived from its fully qualified type name.
- To let multiple cache types share the same Redis keys, explicitly override `KeyPrefix()` and return the same value from each type.

## 8. Recommendations

- Embed `redis.Redis` consistently in Redis components.
- Prefer injectable lockers for stable key prefixes.
- Declare injectable caches through `InitCaches(...)`, or create one directly with `NewCache(...)`.
- Listen to `lock.Context()` when you need to detect lock invalidation.
- Once a `Lock` is broken, discard it and acquire a new one through `Locker.Lock(...)`.
