# 1.0.0 (2025-12-19)


### Bug Fixes

* enhance CORS handling by checking for same-origin requests before adding CORS headers ([4ac5da1](https://github.com/janovix/auth-svc/commit/4ac5da149cc443058eb1e5ce469d896f2fb6f5a2))
* ensure proper CORS header handling by cloning response before adding headers ([5f936e0](https://github.com/janovix/auth-svc/commit/5f936e01352270c06a0980120d9c3d37b9a3de2b))
* removed package manager fron package.json ([c55ee2d](https://github.com/janovix/auth-svc/commit/c55ee2d4cf6aec4442b7604f826c49b977bd6dad))


### Features

* Add BETTER_AUTH_URL to integration tests ([f01f14b](https://github.com/janovix/auth-svc/commit/f01f14bc6bb4b9ddbda84d25d5f80cf6acba6510))
* Add CORS handling for Better Auth routes ([a1bdd3e](https://github.com/janovix/auth-svc/commit/a1bdd3e0b416ed7c37ffcd7431ed7aa42d731cab))
* Add CORS logging and improve origin checking ([06bdd66](https://github.com/janovix/auth-svc/commit/06bdd662708fcf48d49872ee47d35759bf50135a))
* add default cookie attributes to enhance cookie accessibility across paths ([24188c5](https://github.com/janovix/auth-svc/commit/24188c5177fe6643191fd5666750880e1d0e0239))
* Enable nodejs_compat for better-auth ([20e45fa](https://github.com/janovix/auth-svc/commit/20e45fa493744e3f90a7d6f3f4be4cc5229c5c82))
* Handle OPTIONS preflight requests before CORS middleware ([58bd8f6](https://github.com/janovix/auth-svc/commit/58bd8f630c373c9ba4709dcf8544ee7b6c607cfd))
* Integrate Better Auth and Prisma ([49145a6](https://github.com/janovix/auth-svc/commit/49145a6158153144bccea6b0680aa89f1bc16e1f))
* Prioritize AUTH_TRUSTED_ORIGINS over environment defaults ([dc7f14d](https://github.com/janovix/auth-svc/commit/dc7f14d3dcd04a28eabbd61c3d7bb0281bb71a42))
* Set pnpm as package manager ([7f2820f](https://github.com/janovix/auth-svc/commit/7f2820f0cd0183dde2fb1bb2d961bb0130136cbf))
* Validate BETTER_AUTH_URL in auth config ([c9a504e](https://github.com/janovix/auth-svc/commit/c9a504e816dcc14fa92ca225b1397bf8fcfcaed6))

# [1.0.0-rc.26](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.25...v1.0.0-rc.26) (2025-12-30)


### Features

* **auth:** add multi-tenant organization support ([3cce3d8](https://github.com/janovix/auth-svc/commit/3cce3d8f7f7bf26b9d12de617e3ac9e805e7498b))

# [1.0.0-rc.25](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.24...v1.0.0-rc.25) (2025-12-20)


### Bug Fixes

* **auth:** redirect to frontend after email verification ([b9269d5](https://github.com/janovix/auth-svc/commit/b9269d5302d7087dac6b8f74741162556f906e47))

# [1.0.0-rc.24](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.23...v1.0.0-rc.24) (2025-12-20)


### Bug Fixes

* **auth:** allow verify-email and reset-password routes without token ([ff9e8b5](https://github.com/janovix/auth-svc/commit/ff9e8b52914a6424e1b959a9863d181ef96364e7))

# [1.0.0-rc.23](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.22...v1.0.0-rc.23) (2025-12-20)


### Features

* require email verification before sign-in ([3c861cd](https://github.com/janovix/auth-svc/commit/3c861cda485b510466d4cc9f451414b39d10fc54))

# [1.0.0-rc.22](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.21...v1.0.0-rc.22) (2025-12-20)


### Bug Fixes

* exclude openapi.ts from coverage requirements ([c2f09f7](https://github.com/janovix/auth-svc/commit/c2f09f7a6b76f0aa58cbcc9a6dd376976776703e))

# [1.0.0-rc.21](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.20...v1.0.0-rc.21) (2025-12-20)


### Features

* add email verification support ([4551ece](https://github.com/janovix/auth-svc/commit/4551ece29133c038acbe5628c2fe8f05cca347e9))

# [1.0.0-rc.20](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.19...v1.0.0-rc.20) (2025-12-20)


### Performance Improvements

* add KV secondary storage for Better Auth and remove hot-path queries ([73a408f](https://github.com/janovix/auth-svc/commit/73a408f9723e66322c35a262e75369abf7d25a6a))

# [1.0.0-rc.19](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.18...v1.0.0-rc.19) (2025-12-20)


### Features

* add Turnstile validation for password reset requests ([ac1a4e9](https://github.com/janovix/auth-svc/commit/ac1a4e9e7a6197f4b98bed14d1551b6118b8097a))

# [1.0.0-rc.18](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.17...v1.0.0-rc.18) (2025-12-20)


### Features

* add inline images to password reset email template ([d4c1ee2](https://github.com/janovix/auth-svc/commit/d4c1ee28fe97cf48f359ace480f02daf49842ec8))

# [1.0.0-rc.17](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.16...v1.0.0-rc.17) (2025-12-20)


### Features

* send frontend URL in password reset email instead of backend ([8e20bdd](https://github.com/janovix/auth-svc/commit/8e20bdd5e4b24a3bc2a64c4a08fff9c9accaf24c))

# [1.0.0-rc.16](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.15...v1.0.0-rc.16) (2025-12-20)


### Bug Fixes

* await Mandrill API call so waitUntil tracks it correctly ([d74a1f0](https://github.com/janovix/auth-svc/commit/d74a1f0ba5f29dd4e80e84a65a4ec521741572e3))
* removed messages in cors middleware ([3d1a92b](https://github.com/janovix/auth-svc/commit/3d1a92b7d29a7696a409c30efe1a9fa41ed6ac82))

# [1.0.0-rc.15](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.14...v1.0.0-rc.15) (2025-12-20)


### Features

* add Mandrill response logging and callback trigger logging ([caa2da8](https://github.com/janovix/auth-svc/commit/caa2da8d15bf26372f3578f6465a56a85dfdc674))

# [1.0.0-rc.14](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.13...v1.0.0-rc.14) (2025-12-20)


### Features

* add comprehensive logging and waitUntil support for password reset ([46cef05](https://github.com/janovix/auth-svc/commit/46cef052b27759ffbe68c6554d72d32872d85de3))

# [1.0.0-rc.13](https://github.com/janovix/auth-svc/compare/v1.0.0-rc.12...v1.0.0-rc.13) (2025-12-20)


### Bug Fixes

* update Mandrill API endpoint to include .json extension ([23344d1](https://github.com/janovix/auth-svc/commit/23344d1e6f039b5254ecea2ff1fcb9673812ec73))

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
