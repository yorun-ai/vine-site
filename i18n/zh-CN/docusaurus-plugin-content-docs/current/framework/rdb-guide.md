---
slug: /guide/rdb
sidebar_label: 数据库
---

# 数据库

RDB 组件负责连接 PostgreSQL 或 SQLite，并把类型安全的 DAO 注入业务对象。每个数据库组件声明一个连接和一组 DAO。

```go title="database.go"
type MainDatabase struct {
    rdb.Database
}

func (*MainDatabase) InitOption(option *rdb.Option) {
    option.ConnURL = "sqlite://./app.sqlite"
    option.MaxOpenConn = 10
}

func (*MainDatabase) InitDao(add rdb.TypeAdder) {
    add(rdb.T[*UserDao]())
}
```

```go title="app.go"
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainDatabase]())
}
```

:::warning Schema 迁移

Vine 会打开数据库并构造 DAO，但不会自行调用 GORM `AutoMigrate`。具体 DAO 可以覆盖
`EnsureSchema()`：连接打开后、DAO 对外暴露前，Vine 会为组件注册的每个 DAO 调用它，
嵌入的默认实现什么都不做。请让该 hook 可重复执行，或在实例开始服务前把经过审查的
迁移作为显式部署步骤执行。`standalone.Option.HubDBSQLiteFile` 属于 Hub，与这里的
业务数据库无关。

:::

模型嵌入 `rdb.Model`（软删除）或 `rdb.DeletableModel`（物理删除）；DAO 使用模型指针作为泛型参数：

```go title="user.go"
type User struct {
    rdb.Model
    Name string `gorm:"column:name"`
}

type UserDao struct {
    rdb.Dao[*User]
}

type UserService struct {
    Users *UserDao `inject:""`
}

func (s *UserService) Create(name string) *User {
    return s.Users.Create(&User{Name: name})
}
```

连接在组件启动时建立，在应用停止后释放。使用同一 `ConnURL` 的组件共享底层连接池。Model、Query、Patch 与 Delete 语义见 [RDB 参考](../infrastructure/rdb.md)。
