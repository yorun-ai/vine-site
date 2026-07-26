---
slug: /rdb
---

# RDB API Reference

For day-to-day integration, start with [Using Relational Databases](/docs/guide/rdb). This page documents the complete connection, DAO, Query, and model APIs provided by `infra/rdb`.

The top-level `infra/rdb` package exposes public types including `Option`, `TypeAdder`, `DatabaseSpec`, `Database`, `Dao`, `Query`, `Model`, `DeletableModel`, and `Patch`.

`rdb` does not replace GORM. It provides a consistent integration layer that:

- Opens PostgreSQL and SQLite connections.
- Applies consistent connection-pool settings.
- Shares the underlying `*gorm.DB` by `ConnURL`.
- Provides generic `Dao[M]` and `Query[M]` types.
- Integrates database access with DI through the application component mechanism.

## 1. Core Types

### 1.1 `Option`

```go
type Option struct {
    ConnURL     string
    MaxOpenConn int
}
```

Rules:

- `ConnURL` is the database connection string.
- When `MaxOpenConn <= 0`, it falls back to the default value of `10`.

### 1.2 `DatabaseSpec`

The database component interface is:

```go
type DatabaseSpec interface {
    InitOption(option *Option)
    InitDao(add TypeAdder)
}
```

A business component receives the default implementation of this contract by embedding `rdb.Database`.

### 1.3 `Database`

The `rdb.Database` component already includes the lifecycle support required by an application. A business component only needs to embed it and supply configuration:

```go
type ConfigDatabase struct {
    rdb.Database

    Flag *conf.Flag `inject:""`
}

func (d *ConfigDatabase) InitOption(option *rdb.Option) {
    option.ConnURL = "sqlite://" + d.Flag.SQLitePath
    option.MaxOpenConn = 5
}

func (d *ConfigDatabase) InitDao(add rdb.TypeAdder) {
    add(reflect.TypeFor[*ConfigDAO]())
}
```

Then declare the component in the application:

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*ConfigDatabase]())
}
```

## 2. Initialization Flow

The application integrates the database in this order during startup:

1. The application creates the user component `*ConfigDatabase`.
2. It calls `InitOption(...)` and `InitDao(...)`.
3. It opens or reuses a database connection.
4. It registers dependency-injection factories for the declared DAOs.

## 3. Connection Behavior

### 3.1 Connection String Parsing

The underlying rules are:

- An empty `ConnURL` produces an error.
- A URL beginning with `sqlite://` uses SQLite.
- All other connection strings are treated as PostgreSQL connection strings.

### 3.2 Shared Connections

`rdb` shares the underlying `*gorm.DB` by `ConnURL`:

- Components with the same `ConnURL` reuse one connection.
- The first component to open that URL determines its pool settings.
- An internal reference count determines when the connection is actually closed.

### 3.3 Connection-Pool Defaults

Connection-pool settings include:

- `SetMaxOpenConns(...)`
- `SetMaxIdleConns(...)`
- `SetConnMaxIdleTime(...)`
- `SetConnMaxLifetime(...)`

The default policy is:

- `MaxOpenConn` defaults to `10`.
- `MaxIdleConns` is approximately `30%` of the maximum.
- The maximum idle time is `1h`.
- The maximum total connection lifetime is `8h`.

## 4. DI Semantics

Vine provides the user-declared database component to the application as a singleton and creates each DAO through a factory. The DAO factory receives:

- `context.Context`
- `*logger.Logger`

It then injects `gorm.DB.WithContext(...)` into the DAO, so request context and the structured logger follow database operations.

## 5. Lifecycle

The database connection is opened or reused when the component starts, and its shared reference for the `ConnURL` is released after the application stops. Vine closes the underlying connection pool only after its last user has stopped.

## 6. Model Base Types

### 6.1 `Model`

```go
type Model struct {
    Id        int            `gorm:"column:id;primaryKey"`
    CreatedAt time.Time      `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time      `gorm:"column:updated_at;autoUpdateTime"`
    DeletedAt gorm.DeletedAt `gorm:"column:deleted_at"`
}
```

Use it for tables that require soft deletion.

### 6.2 `DeletableModel`

```go
type DeletableModel struct {
    Id        int       `gorm:"column:id;primaryKey"`
    CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}
```

Use it for tables that do not require soft deletion.

## 7. `Dao[M]`

The generic DAO base type is:

```go
type Dao[M ModelConstraint] struct {
    gormDB *gorm.DB
}
```

Common methods include:

- `Query(...)`
- `First(...)`
- `List(...)`
- `Create(model)`
- `Update(model, patch)`
- `Delete(model)`
- `GormDB()`

A typical DAO looks like this:

```go
type ConfigDAO struct {
    rdb.Dao[*ConfigDO]
}
```

## 8. `Query[M]`

`Query[M]` is a lightweight query builder that supports:

- `Limit(...)`
- `Offset(...)`
- `Order(...)`
- `First()`
- `List()`
- `Count()`

Constraints:

- `Limit(...)` must be greater than zero.
- `Offset(...)` cannot be negative.
- `Count()` reuses the current query conditions and applies any configured limit, offset, and order.

For complex queries, use `dao.GormDB()` directly.

## 9. Recommendations

- Embed `Database` in every database component.
- Embed `rdb.Dao[...]` consistently in DAO types.
- When sharing a URL, let the first initialization determine connection-pool settings.
- Use GORM directly for custom transactions and complex queries.
