---
slug: /rdb
sidebar_label: 数据库 API
---

# 数据库 API

把数据库接进应用时，先看[使用关系型数据库](../framework/rdb-guide.md)。需要确认连接
共享、模型语义以及 `Dao`、`Query` 的精确行为时，再查这里的 `infra/rdb` API。

顶层 `infra/rdb` 暴露 `Option`、`TypeAdder`、`DatabaseSpec`、`Database`、`Dao`、`Query`、`Model`、`DeletableModel`、`Patch` 等公共类型。

`rdb` 的定位不是替代 GORM，而是提供一层统一数据库接入：

- 打开 PostgreSQL / SQLite 连接
- 统一配置连接池
- 按 `ConnURL` 共享底层 `*gorm.DB`
- 提供泛型 `Dao[M]` / `Query[M]`
- 通过 app component 机制接入 DI

## 核心类型

### `Option`

```go
type Option struct {
    ConnURL     string
    MaxOpenConn int
}
```

规则：

- `ConnURL`：数据库连接串
- `MaxOpenConn <= 0` 时回退到默认值 `10`

### `DatabaseSpec`

业务组件通过嵌入 `rdb.Database` 并按需实现 `InitOption` 与 `InitDao` 完成配置。

### `Database`

数据库组件 `rdb.Database` 已包含应用所需的生命周期支持。业务组件只需嵌入它并提供配置：

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

然后在 app 中声明组件：

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*ConfigDatabase]())
}
```

## 连接行为

### 连接串解析

底层规则：

- `ConnURL == ""` 会报错
- `sqlite://...` 走 SQLite
- 其他连接串默认按 PostgreSQL 处理

### 共享连接

`rdb` 会按 `ConnURL` 共享底层 `*gorm.DB`：

- 相同 `ConnURL` 会复用同一个连接
- 连接池参数以第一次打开该 URL 时为准

### 连接池默认值

`MaxOpenConn` 默认 `10`；需要调整连接池大小时在 `Option` 上设置它。

## 生命周期

连接在组件启动时打开或复用，在应用停止后关闭。通过同一个 `ConnURL` 共享的连接会一直保持，
直到最后一个使用它的组件停止。

## 模型基类

### `Model`

```go
type Model struct {
    Id        int            `gorm:"column:id;primaryKey"`
    CreatedAt time.Time      `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time      `gorm:"column:updated_at;autoUpdateTime"`
    DeletedAt gorm.DeletedAt `gorm:"column:deleted_at"`
}
```

适合需要软删除的表。

### `DeletableModel`

```go
type DeletableModel struct {
    Id        int       `gorm:"column:id;primaryKey"`
    CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}
```

适合不需要软删除的表。

## `Dao[M]`

具体 DAO 通过嵌入 `Dao[M]` 使用。常用方法：

- `Query(...)`
- `First(...)`
- `List(...)`
- `Create(model)`
- `Update(model, patch)`
- `Delete(model)`
- `GormDB()`

典型 DAO：

```go
type ConfigDAO struct {
    rdb.Dao[*ConfigDO]
}
```

## `Query[M]`

`Query[M]` 是轻量查询构造器，支持：

- `Limit(...)`
- `Offset(...)`
- `Order(...)`
- `First()`
- `List()`
- `Count()`

约束：

- `Limit(...)` 必须大于 0
- `Offset(...)` 必须为非负数
- `Count()` 会复用当前 query 的条件，并应用已设置的 limit / offset / order

复杂查询仍建议直接使用 `dao.GormDB()`。

## 连接与查询规则

- 每个数据库组件都嵌入 `Database`
- DAO 类型统一嵌入 `rdb.Dao[...]`
- 共享 URL 时，第一处初始化负责决定连接池参数
- 如果需要业务自定义事务或复杂查询，直接回到 GORM
