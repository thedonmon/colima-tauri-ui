.PHONY: release release-patch release-minor release-major dev build

# ──────────────────────────────────────────────────────────────
# Usage:
#   make release v=0.2.0      # explicit version
#   make release-patch         # 0.1.1 → 0.1.2
#   make release-minor         # 0.1.1 → 0.2.0
#   make release-major         # 0.1.1 → 1.0.0
#   make dev                   # run dev server
#   make build                 # local release build
# ──────────────────────────────────────────────────────────────

CURRENT := $(shell node -p "require('./package.json').version")

# Bump helpers — compute next version from current
_patch := $(shell echo $(CURRENT) | awk -F. '{printf "%s.%s.%s", $$1, $$2, $$3+1}')
_minor := $(shell echo $(CURRENT) | awk -F. '{printf "%s.%s.0", $$1, $$2+1}')
_major := $(shell echo $(CURRENT) | awk -F. '{printf "%s.0.0", $$1+1}')

release-patch: ; @$(MAKE) release v=$(_patch)
release-minor: ; @$(MAKE) release v=$(_minor)
release-major: ; @$(MAKE) release v=$(_major)

release:
ifndef v
	$(error Usage: make release v=X.Y.Z)
endif
	@echo "Releasing v$(v) (current: $(CURRENT))"
	@# Bump package.json + package-lock.json (npm handles both)
	npm version $(v) --no-git-tag-version
	@# Bump tauri.conf.json
	@sed -i '' 's/"version": "$(CURRENT)"/"version": "$(v)"/' src-tauri/tauri.conf.json
	@# Bump Cargo.toml
	@sed -i '' 's/^version = "$(CURRENT)"/version = "$(v)"/' src-tauri/Cargo.toml
	@# Update Cargo.lock
	@cargo generate-lockfile --manifest-path src-tauri/Cargo.toml 2>/dev/null || true
	@# Commit, tag, push
	git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
	git commit -m "release v$(v)"
	git tag "v$(v)"
	git push origin main "v$(v)"
	@echo ""
	@echo "✓ Pushed v$(v) — GitHub Actions will build and publish the release."

dev:
	npm run tauri dev

build:
	npm run tauri build
