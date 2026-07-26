---
sidebar_position: 1
slug: /
---

# Vine Documentation

Vine is a framework for Go applications. This documentation takes you from creating an application through using configuration, service calls, asynchronous tasks, and external access.

## Get Started

- [Learn about Vine](/docs/getting-started): Meet App, Hub, Link, Portal, and skelc.
- [Start your first application](/docs/tutorial-first-app): Start the complete Vine runtime in a single process.
- [Create your first Skel contract](/docs/first-skel-contract): Validate a contract and generate type-safe code.
- [Runtime modes and deployment topologies](/docs/deployment-modes): Choose standalone, linked, or fully separated deployment.
- [Command line](/docs/cli): Install `vine`, inspect its version, and start runtime services.
- [Project structure](/docs/filetree): Learn the recommended structure for Vine applications and modules.

## Core Concepts

- [Application model](/docs/application-model): Understand how App, Module, Portal, Link, and Hub form an application.
- [Components and modules](/docs/components): Organize business capabilities and lifecycle resources.
- [Dependency injection](/docs/di): Scopes, bindings, and executions.
- [Context metadata](/docs/meta): Trace, initiator, and actor metadata.
- [Error handling](/docs/ex): Unified error codes and recovery conventions.
- [Execution container](/docs/ctr): Filter chains and method execution.

## Application Capabilities

- [Application configuration](/docs/configuration): Move from Skel declarations to runtime injection.
- [Rpc](/docs/guide/rpc): Declare a service, implement its methods, and make a call.
- [Web](/docs/web): Register routes, static resources, and external entry points.
- [Event and Task](/docs/events-and-tasks): Asynchronous messages, tasks, and scheduling.
- [Redis](/docs/guide/redis): Configure a connection and inject type-safe Redis capabilities.
- [Relational databases](/docs/guide/rdb): Configure data sources, transactions, and database access.
- [Logging and testing](/docs/logging-and-testing): Structured logging and standalone integration tests.

## Runtime and Deployment

- [Component runtime mechanisms](/docs/runtime-mechanisms): Startup, registration, discovery, configuration, message delivery, and graceful shutdown.
- [Hub](/docs/hub): Configuration, service registration, and runtime dispatch.
- [Link](/docs/link): Application connectivity, service discovery, and local capability execution.
- [Portal](/docs/portal): External HTTP/HTTPS, Rpc, and Web gateway.
- [Runtime modes and deployment topologies](/docs/deployment-modes): Choose standalone, linked, or fully separated deployment.

## Skel and Code Generation

- [skelc documentation](https://skel.yorun.ai/docs/): Installation, language reference, CLI, code generation, and runtime types.

## Reference

After completing the introductory tutorials, continue with the full references for [App](/docs/app), [Rpc](/docs/rpc), [Redis](/docs/redis), [RDB](/docs/rdb), and the [framework package index](/docs/core-packages).
