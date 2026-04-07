# Learning Observer / `lo_event` Integration

This guide explains how to connect LO Blocks to a Learning Observer instance, enabling per-user event tracking and state synchronization across browsers via a shared websocket logger.

## What is Learning Observer?

[Learning Observer](https://learning-observer.readthedocs.io/en/latest/) is a learning application platform that allows developers to create modular educational applications. Each module can define reducers, data queries, and dashboards for tracking student progress and engagement.

## Prerequisites

Before connecting LO Blocks to Learning Observer, you'll need to:

1. **Install Learning Observer** - Follow the [installation tutorial](https://learning-observer.readthedocs.io/en/latest/docs/tutorials/install.html) to set up the base platform
2. **Create a module** - Use the [module creation tutorial](https://learning-observer.readthedocs.io/en/latest/docs/tutorials/cookiecutter-module.html) to scaffold your module
3. **Configure authentication** - Depending on your LO Blocks authentication setup, you may need to adjust how Learning Observer handles incoming event authentication

## Connecting LO Blocks to Learning Observer

LO Blocks uses [LO Event](https://github.com/ArgLab/lo_event), a specialized logging module designed for the Learning Observer environment.

### Configuration

Event logging is initialized in `src/lib/state/store.ts`. To enable the connection:

1. Configure the `WebsocketLogger` to point to your Learning Observer instance URL
2. The `ReduxLogger` will automatically:
   - Load the initial state from the server via websocket
   - Continuously synchronize state changes back to the server

This setup ensures that user progress and interactions are preserved across sessions and devices.
