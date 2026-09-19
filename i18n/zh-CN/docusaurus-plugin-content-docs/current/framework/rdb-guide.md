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

func (d *UserDao) EnsureSchema() {
    if err := d.GormDB().AutoMigrate(&User{}); err != nil {
        panic(err)
    }
}
```

```go title="app.go"
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainDatabase]())
}
```

:::warning Schema 迁移

Vine 打开数据库后、向外暴露 DAO 前，会对已注册 DAO 调用空的 `EnsureSchema` 方法。
可以在 DAO 中覆写它，执行经过审查的迁移或显式 schema 初始化；Vine 不会自动调用
GORM `AutoMigrate`。
`standalone.Option.HubDBSQLiteFile` 属于 Hub，与这里的业务数据库无关。

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
