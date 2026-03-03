#!/bin/bash

# Script to test the example project using Bun
# Run from the root of the package

echo "🚀 Testing supabase-expo-ota-updates Example Project (with Bun)"
echo "================================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from package root directory"
    exit 1
fi

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

echo "✅ Using Bun $(bun --version)"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies with Bun..."
bun install
if [ $? -ne 0 ]; then
    echo "❌ Dependency installation failed"
    exit 1
fi
echo "✅ Dependencies installed"
echo ""

# Run TypeScript check
echo "🔍 Step 2: Running TypeScript check..."
bun run typecheck
if [ $? -ne 0 ]; then
    echo "❌ TypeScript check failed"
    exit 1
fi
echo "✅ TypeScript check passed"
echo ""

# Step 2: Go to example directory and install
cd example

echo "📦 Step 2: Installing example dependencies..."
bun install
if [ $? -ne 0 ]; then
    echo "❌ Example dependency installation failed"
    exit 1
fi
echo "✅ Example dependencies installed"
echo ""

# Step 3: Run Bun tests
echo "🧪 Step 3: Running Bun tests..."
bun test
if [ $? -ne 0 ]; then
    echo "❌ Bun tests failed"
    exit 1
fi
echo ""

cd ..

echo "================================================================"
echo "✅ All tests passed!"
echo ""
echo "Next steps:"
echo "  cd example"
echo "  bun start"
echo ""
