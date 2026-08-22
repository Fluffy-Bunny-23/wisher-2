.PHONY: install lint typecheck test-unit test-convex test-e2e ci-fast ci dev build

install:
	pnpm install

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test-unit:
	pnpm test:unit

test-convex:
	pnpm test:convex

test-e2e:
	pnpm test:e2e

# lint + typecheck + unit + convex tests (no browser E2E)
ci-fast:
	pnpm run ci:fast

# full local CI: fast path then E2E smoke suite
ci:
	pnpm run ci

dev:
	pnpm dev

build:
	pnpm build
