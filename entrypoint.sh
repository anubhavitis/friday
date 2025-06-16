#!/bin/bash
echo "Working Directory: $(pwd)"
echo "Files in schema/:"
ls -al ./schema

echo "Running db:generate..."
bun run db:generate

echo "Running db:push..."
bun run db:push

echo "Starting server..."
bun run start