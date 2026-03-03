#!/bin/bash

# Test script for example project

echo "🧪 Running Example Project Tests"
echo "================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
    echo ""
fi

# Run TypeScript check
echo "🔍 Running TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript check failed"
    exit 1
fi
echo "✅ TypeScript check passed"
echo ""

# Run tests
echo "🧪 Running Jest tests..."
yarn test --coverage --watchAll=false
if [ $? -ne 0 ]; then
    echo "❌ Tests failed"
    exit 1
fi
echo ""

echo "✅ All tests passed!"
