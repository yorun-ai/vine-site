---
slug: /guide/rdb
---

# Using a Relational Database

The RDB component connects to PostgreSQL or SQLite and injects type-safe DAOs into business objects. Each database component declares one connection and a set of DAOs.

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

Embed `rdb.Model` for soft deletion or `rdb.DeletableModel` for physical deletion. A DAO uses a pointer to its model as the generic argument:

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

The connection is established when the component starts and released after the application stops. Components with the same `ConnURL` share the underlying connection pool. See the [RDB Reference](/docs/rdb) for Model, Query, Patch, and deletion semantics.
