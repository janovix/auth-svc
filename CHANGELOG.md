# [1.0.0-rc.12](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.11...v1.0.0-rc.12) (2025-12-19)


### Features

* add comprehensive debug logging for password reset emails ([95d6879](https://github.com/janovix/auth-svc/commit/95d68796795f9cbce5d350920cd09343029fda9a))

# [1.0.0-rc.11](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.10...v1.0.0-rc.11) (2025-12-19)


### Bug Fixes

* from name sending function ([b817a98](https://github.com/janovix/auth-svc/commit/b817a98421be760e7d1c617007b01242527a1885))

# [1.0.0-rc.10](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.9...v1.0.0-rc.10) (2025-12-19)


### Features

* implement password reset with Mandrill email integration ([c9fe6a3](https://github.com/janovix/auth-svc/commit/c9fe6a3af26209d4aec877f9353c4fef5ab29a18))

# [1.0.0-rc.9](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.8...v1.0.0-rc.9) (2025-12-19)


### Features

* Set pnpm as package manager ([7f2820f](https://github.com/janovix/auth-svc/commit/7f2820f0cd0183dde2fb1bb2d961bb0130136cbf))

# [1.0.0-rc.8](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.7...v1.0.0-rc.8) (2025-12-16)


### Features

* add default cookie attributes to enhance cookie accessibility across paths ([24188c5](https://github.com/janovix/auth-svc/commit/24188c5177fe6643191fd5666750880e1d0e0239))

# [1.0.0-rc.7](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.6...v1.0.0-rc.7) (2025-12-16)


### Bug Fixes

* ensure proper CORS header handling by cloning response before adding headers ([5f936e0](https://github.com/janovix/auth-svc/commit/5f936e01352270c06a0980120d9c3d37b9a3de2b))

# [1.0.0-rc.6](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.5...v1.0.0-rc.6) (2025-12-16)


### Bug Fixes

* enhance CORS handling by checking for same-origin requests before adding CORS headers ([4ac5da1](https://github.com/janovix/auth-svc/commit/4ac5da149cc443058eb1e5ce469d896f2fb6f5a2))

# [1.0.0-rc.5](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.4...v1.0.0-rc.5) (2025-12-16)


### Features

* Enable nodejs_compat for better-auth ([20e45fa](https://github.com/janovix/auth-svc/commit/20e45fa493744e3f90a7d6f3f4be4cc5229c5c82))

# [1.0.0-rc.4](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.3...v1.0.0-rc.4) (2025-12-16)


### Features

* Prioritize AUTH_TRUSTED_ORIGINS over environment defaults ([dc7f14d](https://github.com/janovix/auth-svc/commit/dc7f14d3dcd04a28eabbd61c3d7bb0281bb71a42))

# [1.0.0-rc.3](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.2...v1.0.0-rc.3) (2025-12-16)


### Features

* Add CORS logging and improve origin checking ([06bdd66](https://github.com/janovix/auth-svc/commit/06bdd662708fcf48d49872ee47d35759bf50135a))
* Handle OPTIONS preflight requests before CORS middleware ([58bd8f6](https://github.com/janovix/auth-svc/commit/58bd8f630c373c9ba4709dcf8544ee7b6c607cfd))

# [1.0.0-rc.2](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2025-12-15)


### Features

* Add BETTER_AUTH_URL to integration tests ([f01f14b](https://github.com/janovix/auth-svc/commit/f01f14bc6bb4b9ddbda84d25d5f80cf6acba6510))
* Add CORS handling for Better Auth routes ([a1bdd3e](https://github.com/janovix/auth-svc/commit/a1bdd3e0b416ed7c37ffcd7431ed7aa42d731cab))
* Validate BETTER_AUTH_URL in auth config ([c9a504e](https://github.com/janovix/auth-svc/commit/c9a504e816dcc14fa92ca225b1397bf8fcfcaed6))

# 1.0.0-rc.1 (2025-12-15)


### Bug Fixes

* removed package manager fron package.json ([c55ee2d](https://github.com/janovix/auth-svc/commit/c55ee2d4cf6aec4442b7604f826c49b977bd6dad))


### Features

* Integrate Better Auth and Prisma ([49145a6](https://github.com/janovix/auth-svc/commit/49145a6158153144bccea6b0680aa89f1bc16e1f))

# [1.1.0](https://github.com/algtools/backend-template/compare/v1.0.0...v1.1.0) (2025-12-14)


### Features

* Add TASKS_KV namespace to wrangler configs ([dc106de](https://github.com/algtools/backend-template/commit/dc106debc6d30662d681ddd765723f41b3505d42))
* enhance API with metadata and health check endpoints ([dc9a501](https://github.com/algtools/backend-template/commit/dc9a501e5947d2231cbb26dc84330093cb108369))
* Implement KV caching for tasks API ([f1d1262](https://github.com/algtools/backend-template/commit/f1d1262446fe920cac2e1b65703f5aab8af9ee50))

# [1.1.0-rc.1](https://github.com/algtools/backend-template/compare/v1.0.0...v1.1.0-rc.1) (2025-12-14)


### Features

* Add TASKS_KV namespace to wrangler configs ([dc106de](https://github.com/algtools/backend-template/commit/dc106debc6d30662d681ddd765723f41b3505d42))
* enhance API with metadata and health check endpoints ([dc9a501](https://github.com/algtools/backend-template/commit/dc9a501e5947d2231cbb26dc84330093cb108369))
* Implement KV caching for tasks API ([f1d1262](https://github.com/algtools/backend-template/commit/f1d1262446fe920cac2e1b65703f5aab8af9ee50))

# 1.0.0 (2025-12-13)

### Features

* Add TASKS_KV namespace to wrangler configs ([dc106de](https://github.com/algtools/backend-template/commit/dc106debc6d30662d681ddd765723f41b3505d42))
* Implement KV caching for tasks API ([f1d1262](https://github.com/algtools/backend-template/commit/f1d1262446fe920cac2e1b65703f5aab8af9ee50))

# [1.0.0-rc.2](https://github.com/algtools/backend-template/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2025-12-13)


### Features

* enhance API with metadata and health check endpoints ([dc9a501](https://github.com/algtools/backend-template/commit/dc9a501e5947d2231cbb26dc84330093cb108369))
* Add linting and formatting dependencies ([ef9d4c8](https://github.com/algtools/backend-template/commit/ef9d4c8ca32276f4bd49f5d46ba9723d0f06f478))

# 1.0.0-rc.1 (2025-12-13)


### Features

* Add linting and formatting dependencies ([ef9d4c8](https://github.com/algtools/backend-template/commit/ef9d4c8ca32276f4bd49f5d46ba9723d0f06f478))
