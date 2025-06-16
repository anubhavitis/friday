#!/bin/bash
bun run db:generate
bun run db:push
bun run start