---
slug: /rdb
sidebar_label: Database API
---

# Database API

Start with [Using Relational Databases](../framework/rdb-guide.md) to add a
database to an application. Use this reference for connection sharing, model
semantics, and the exact `Dao` and `Query` behavior exposed by `infra/rdb`.

The top-level `infra/rdb` package exposes public types including `Option`,
`TypeAdder`, `DatabaseSpec`, `Database`, `Dao`, `Query`, `Model`,
`DeletableModel`, and `Patch`.

`rdb` doesn't replace GORM. Instead, it provides a consistent integration layer
that:

- Opens PostgreSQL and SQLite connections.
- Applies consistent connection-pool settings.
- Shares the underlying `*gorm.DB` by `ConnURL`.
- Provides generic `Dao[M]` and `Query[M]` types.
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

A business component embeds `rdb.Database` and overrides `InitOption` and
`InitDao` as needed. Each registered DAO inherits an empty `EnsureSchema`
method; override it on a concrete DAO for reviewed migrations or other schema
setup. Vine calls these methods after opening the connection and before DAOs
are exposed.

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

func (d *ConfigDAO) EnsureSchema() {
    if err := d.GormDB().AutoMigrate(&ConfigModel{}); err != nil {
        panic(err)
    }
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

## `Query[M]`

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
- `Count()` reuses the current query conditions and applies any configured limit,
  offset, and order.

For complex queries, use `dao.GormDB()` directly.

## Connection and query rules

- Embed `Database` in every database component.
- Embed `rdb.Dao[...]` consistently in DAO types.
- When sharing a URL, let the first initialization determine connection-pool
  settings.
- Use GORM directly for custom transactions and complex queries.
