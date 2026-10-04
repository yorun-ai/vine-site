---
slug: /rdb
sidebar_label: Database API
---

# Database API

Start with [Using Relational Databases](../framework/rdb-guide.md) to add a
database to an application. Use this reference for connection sharing, model
semantics, and the exact `Dao`, `Query`, and `Filtered` behavior exposed by `infra/rdb`.

The top-level `infra/rdb` package exposes public types including `Option`,
`TypeAdder`, `DatabaseSpec`, `Database`, `Dao`, `Query`, `Filtered`, `Model`,
`DeletableModel`, and `Patch`.

`rdb` doesn't replace GORM. Instead, it provides a consistent integration layer
that:

- Opens PostgreSQL and SQLite connections.
- Applies consistent connection-pool settings.
- Shares the underlying `*gorm.DB` by `ConnURL`.
- Provides generic `Dao[M]`, `Query[M]`, and `Filtered[M]` types.
- Integrates database access with DI through the application component mechanism.

## Core Types

### `Option`

```go
type Option struct {
    ConnURL     string
    MaxOpenConn int
}
```

- `ConnURL` is the database connection string.
- When `MaxOpenConn <= 0`, it falls back to the default value of `10`.

### `DatabaseSpec`

A business component embeds `rdb.Database` and may override `InitOption` and
`InitDao`.

### `Database`

The `rdb.Database` component already includes the lifecycle support an
application needs. A business component only has to embed it and supply
configuration:

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

## Connection Behavior

### Connection String Parsing

The underlying rules:

- An empty `ConnURL` produces an error.
- A URL beginning with `sqlite://` uses SQLite.
- All other connection strings are treated as PostgreSQL connection strings.

### Shared Connections

`rdb` shares the underlying `*gorm.DB` by `ConnURL`:

- Components with the same `ConnURL` reuse one connection.
- The first component to open that URL determines its pool settings.

### Connection-Pool Defaults

`MaxOpenConn` defaults to `10`; set it on `Option` to change the pool size.

## Lifecycle

The connection opens or is reused when the component starts and closes after the
application stops. A connection shared through one `ConnURL` stays open until the
last component using it has stopped.

## Model Base Types

### `Model`

```go
type Model struct {
    Id        int            `gorm:"column:id;primaryKey"`
    CreatedAt time.Time      `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time      `gorm:"column:updated_at;autoUpdateTime"`
    DeletedAt gorm.DeletedAt `gorm:"column:deleted_at"`
}
```

Use it for tables that need soft deletion.

### `DeletableModel`

```go
type DeletableModel struct {
    Id        int       `gorm:"column:id;primaryKey"`
    CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}
```

Use it for tables that do not need soft deletion.

## `Dao[M]`

A concrete DAO embeds `Dao[M]`. Common methods include:

- `Query(...)`
- `Filter(...)`
- `One(...)`
- `First(...)`
- `Exists(...)`
- `List(...)`
- `Create(model)`
- `Update(model, patch)`
- `Delete(model)`
- `GormDB()`

Vine runs `EnsureSchema()` for every DAO a component registers, after the
connection opens and before DAOs are exposed. The embedded implementation does
nothing, so a concrete DAO can override it to create or migrate its own schema
through `GormDB()`.

A typical DAO looks like this:

```go
type ConfigDAO struct {
    rdb.Dao[*ConfigDO]
}
```

## `Query[M]`

`Query[M]` is a lightweight query builder that supports:

- `Limit(...)`
- `Offset(...)`
- `Order(...)`
- `First()`
- `Exists()`
- `List()`
- `Count()`

Constraints:

- `Limit(...)` must be greater than zero.
- `Offset(...)` cannot be negative.
- `Count()` reuses the current query conditions and applies any configured limit,
  offset, and order.

Use `Exists()` when only the presence of a record matters:

```go
exists := dao.Exists(id)
hasPending := dao.Query("status = ?", "pending").Exists()
```

It returns `false` when no record matches and panics on database errors. Conditions
use the same UUID normalization as other DAO queries, and soft-deleted records are
excluded by default. The query selects a constant with a limit of one, without
loading a model or invoking `AfterFind` hooks. `Query.Exists()` applies the current
offset and order and uses a limit of one without changing the builder's limit.

For complex queries, use `dao.GormDB()` directly.

## `Filtered[M]`

`Dao.Filter(conditions...)` selects records for conditional writes without loading
them first. It accepts the same conditions and UUID normalization as `Query`:

```go
affected := dao.Filter("status = ?", "pending").Update(rdb.Patch{
    "status": "expired",
})
deleted := dao.Filter("status = ?", "expired").Delete()
```

- `Update(patch)` and `Delete()` return the affected row count as `int`. No matches
  returns zero; database errors panic.
- `Patch` preserves nil and zero values and supports `gorm.Expr` values.
- Deletion follows the model: models with `DeletedAt` use soft deletion; models
  without it are physically deleted. Soft-deleted records are excluded by default.
- `Filtered` has no ordering or paging methods. Use `Query` for reads.
- `Filter()` without conditions panics immediately, and an empty predicate is left
  to GORM's missing-`WHERE` protection.

### Writes affecting exactly one row

`Dao.One(conditions...)` returns the same `Filtered[M]` type with an exact-one-row
constraint. Conditions are required, just as with `Filter`:

```go
affected := dao.One(id).Update(rdb.Patch{
    "enabled": false,
})
deleted := dao.One(id).Delete()
```

Both methods return `1` on success. Zero or multiple affected rows cause a panic
and rollback. The write and row-count check run in a transaction; inside an
existing transaction, `One` runs its own operation under a GORM savepoint.

Use `Filter` when zero matches are an expected outcome, such as a concurrent
state change, or when updating multiple records is intentional.

## Connection and query rules

- Embed `Database` in every database component.
- Embed `rdb.Dao[...]` consistently in DAO types.
- When sharing a URL, let the first initialization determine connection-pool
  settings.
- Use GORM directly for custom transactions and complex queries.
