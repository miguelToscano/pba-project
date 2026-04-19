SHELL := /bin/bash

ROOT_DIR := $(shell pwd)

# Domain to deploy to — override with: make deploy-frontend DOMAIN=my-app.dot
DOMAIN ?= polkadot-stack-template00.dot

.PHONY: deploy-frontend
deploy-frontend: build-frontend check-bulletin-deploy check-ipfs
	@echo "Deploying frontend to Bulletin Chain..."
	@echo "  Domain:  $(DOMAIN)"
	@echo "  URL:     https://$(DOMAIN).li"
	@if [ -n "$(MNEMONIC)" ]; then \
		MNEMONIC="$(MNEMONIC)" bulletin-deploy $(ROOT_DIR)/web/dist $(DOMAIN); \
	else \
		bulletin-deploy $(ROOT_DIR)/web/dist $(DOMAIN); \
	fi

.PHONY: build-frontend
build-frontend:
	@echo "Building frontend..."
	@cd $(ROOT_DIR)/web && npm install --silent && npm run build
	@echo "  Build output: web/dist/"

.PHONY: check-bulletin-deploy
check-bulletin-deploy:
	@if ! command -v bulletin-deploy &>/dev/null; then \
		echo "ERROR: bulletin-deploy not installed."; \
		echo "Run: npm install -g bulletin-deploy"; \
		exit 1; \
	fi

.PHONY: check-ipfs
check-ipfs:
	@if ! command -v ipfs &>/dev/null; then \
		echo "ERROR: IPFS Kubo not installed (required by bulletin-deploy)."; \
		echo "macOS:  brew install ipfs && ipfs init"; \
		echo "Linux:  see https://docs.ipfs.tech/install/command-line/"; \
		exit 1; \
	fi
