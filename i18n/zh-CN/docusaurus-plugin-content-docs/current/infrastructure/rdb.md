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

数据库组件接口是：

```go
type DatabaseSpec interface {
    InitOption(option *Option)
    InitDao(add TypeAdder)
}
```

业务组件通过嵌入 `rdb.Database` 获得该契约的默认实现。

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

## 初始化流程

应用启动时按以下顺序接入数据库：

1. app 创建用户组件 `*ConfigDatabase`
2. 调用 `InitOption(...)` 和 `InitDao(...)`
3. 打开或复用数据库连接
4. 为已声明的 DAO 注册依赖注入工厂

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
- 内部通过引用计数决定何时真正关闭

### 连接池默认值

连接池设置包括：

- `SetMaxOpenConns(...)`
- `SetMaxIdleConns(...)`
- `SetConnMaxIdleTime(...)`
- `SetConnMaxLifetime(...)`

默认策略：

- `MaxOpenConn` 默认 `10`
- `MaxIdleConns` 约为 `30%`
- 空闲连接最长 `1h`
- 总生命周期最长 `8h`

## DI 语义

Vine 将用户声明的数据库组件作为单例提供给应用，并通过 factory 创建每个 DAO。DAO factory 会取得：

- `context.Context`
- `*logger.Logger`

随后把 `gorm.DB.WithContext(...)` 注入 DAO，因此请求 context 与结构化 logger 会跟随数据库操作。

## 生命周期

数据库连接在组件启动时打开或复用，在应用停止后释放该 `ConnURL` 的共享引用。最后一个使用者停止后，Vine 才关闭底层连接池。

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

泛型 DAO 基类：

```go
type Dao[M ModelConstraint] struct {
    gormDB *gorm.DB
}
```

常用方法：

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
