# [1.6.0-rc.1](https://github.com/janovix/auth-svc/compare/v1.5.0...v1.6.0-rc.1) (2026-02-24)


### Features

* **migrations:** add stripeCustomerId column to users table for Better Auth integration ([1c59977](https://github.com/janovix/auth-svc/commit/1c5997749e56b0798d4d412ffc14efce1f192505))

# [1.5.0](https://github.com/janovix/auth-svc/compare/v1.4.0...v1.5.0) (2026-02-23)


### Bug Fixes

* **api-keys:** correct eligibility check for business plan in tests ([969c068](https://github.com/janovix/auth-svc/commit/969c06894f75e0c617eda976314ae98a6a77d165))
* **auth:** add cleanup for execution context on validation and auth failures ([be3d58e](https://github.com/janovix/auth-svc/commit/be3d58ea7f9864c5289c883cfd3122e570896d44))
* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))
* **auth:** update rate limits for various environments ([e14d369](https://github.com/janovix/auth-svc/commit/e14d369d904f5a41635dc6ad879c239992656b0b))
* **notifications:** enhance notification dispatch logging and error handling for organization updates ([475266c](https://github.com/janovix/auth-svc/commit/475266c08be1b8961ba0e777c2ff673663761ced))
* **subscription:** query user role directly from database to avoid stale session data ([75bf58a](https://github.com/janovix/auth-svc/commit/75bf58a9b1ed4b243ba7f8a1c90655efc801ee44))


### Features

* **migrations:** add stripeCustomerId column to users table for Better Auth integration ([1c59977](https://github.com/janovix/auth-svc/commit/1c5997749e56b0798d4d412ffc14efce1f192505))
* **admin:** add admin statistics and KV management endpoints ([11bb19e](https://github.com/janovix/auth-svc/commit/11bb19e39e3683f3ce2d244bc6d7a178234020dc))
* **admin:** implement admin organizations routes and replace internal organizations access ([81f3ca0](https://github.com/janovix/auth-svc/commit/81f3ca09a76ada214f90282e63e8ec570f621090))
* **aml-settings:** add AML Compliance Settings proxy routes and OpenAPI documentation ([d246f4d](https://github.com/janovix/auth-svc/commit/d246f4d3ff9c8c8a0918feb5c5fa5e9e4b4aaa29))
* **api-keys:** add enterprise plan to API access validation ([f4d1153](https://github.com/janovix/auth-svc/commit/f4d1153c784aec0afe0d22912ed02506736f6390))
* **api-keys:** implement API keys management for organization-scoped access ([32a42db](https://github.com/janovix/auth-svc/commit/32a42dbe1b9c0534012ab84607f694b1500be299))
* **api-keys:** integrate jose for JWT signing and enhance ephemeral JWT creation ([ef27550](https://github.com/janovix/auth-svc/commit/ef275509e30a332c8c98d3dc49c526e8da3ba4e9))
* **api-keys:** update API_ENABLED_PLANS to include 'business' plan ([6932cee](https://github.com/janovix/auth-svc/commit/6932ceee84ca63275c307dd7496b5e989ea040ed))
* **auth:** add error handling configuration for API errors and update public route list ([2053704](https://github.com/janovix/auth-svc/commit/205370437ac45fb59db5b3f5c6a2df26da6ba2e5))
* **auth:** add Google OAuth configuration for social login ([9c44357](https://github.com/janovix/auth-svc/commit/9c443570856c5045b5018ed7f50b9c905f6a1ec9))
* **auth:** add OAuth provider callback routes to public access list ([f272e07](https://github.com/janovix/auth-svc/commit/f272e0716997abfa2516c30f98d0d4e7c82aac63))
* **auth:** enhance organization limit checks with enterprise license support ([977e650](https://github.com/janovix/auth-svc/commit/977e6503bdb94e3ad41fd0ef8a2106cd34d52b7b))
* **auth:** enhance rate limiting with custom storage for KV environments ([459cc8b](https://github.com/janovix/auth-svc/commit/459cc8b2df58d127a9fc6a64083d560c2115d3d1)), closes [hi#frequency](https://github.com/hi/issues/frequency)
* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** establish execution context for all routes ([b49c269](https://github.com/janovix/auth-svc/commit/b49c2697ced8112ffb624c464b3a210e1ff31b28))
* **auth:** implement custom rate limit rules for OTP endpoints and configure storage options across environments ([e68b486](https://github.com/janovix/auth-svc/commit/e68b486a2afe9ffa6c448d20025eded68876c4f8))
* **auth:** implement dedicated JWKS endpoint handler ([351f240](https://github.com/janovix/auth-svc/commit/351f240084c2c9168bc20e920da8890abda59d0a))
* **auth:** implement user promotion from visitor to user based on pending invitations ([26efe7c](https://github.com/janovix/auth-svc/commit/26efe7c199d0e09211c8c2f6732bc47dabf97888))
* **auth:** implement visitor role and promote endpoint for beta access ([0059eff](https://github.com/janovix/auth-svc/commit/0059eff8fa6eb13f80768ff209a7b44ecc1f6ea4))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))
* **auth:** integrate Sentry for enhanced error tracking ([39dc5e7](https://github.com/janovix/auth-svc/commit/39dc5e7683be17d43de736b2b54a8aad85eeeb12))
* **cors:** consistently expose X-Retry-After header in CORS responses ([e4ce4c2](https://github.com/janovix/auth-svc/commit/e4ce4c2f37e52f94f4510b76505d017123c71e6c))
* **cors:** expose X-Retry-After header in CORS middleware ([374db60](https://github.com/janovix/auth-svc/commit/374db606ed523441ae468f818071c8621ce64bc9))
* **logging:** integrate Sentry for error tracking and remove excessive logging ([160bb60](https://github.com/janovix/auth-svc/commit/160bb60cbcc5c0dd983dc55994a316e65071f3ea))
* **notifications:** add absolute callbackUrl to org settings notification ([30bbf07](https://github.com/janovix/auth-svc/commit/30bbf079520760916137b609c32f36b70d915531))
* **notifications:** add notifications service binding and dispatch logic for organization updates ([1f78692](https://github.com/janovix/auth-svc/commit/1f786920d41f14076596804f2ed38d51d3774cb6))
* **passkey:** add support for Better Auth passkey plugin ([a3dd710](https://github.com/janovix/auth-svc/commit/a3dd710e7996e3146abf569ba0b9c07a9cac8001))
* **pricing, subscription:** enhance license activation and subscription organization limit checks ([08dd7d3](https://github.com/janovix/auth-svc/commit/08dd7d3fc97f38a2e7f0f78c513483bb2c9732a0))
* **pricing:** add license management features for superseding and revoking licenses ([0c53f69](https://github.com/janovix/auth-svc/commit/0c53f69864b827b55b96f3aae2bc6ad68284f3a5))
* **routes:** add internal organizations route for member enumeration ([8bb897e](https://github.com/janovix/auth-svc/commit/8bb897e6d77c4ccba06d9b5d13d6d94d317e353f))
* **subscription-admin:** add subscription management routes for admin ([be0789e](https://github.com/janovix/auth-svc/commit/be0789e883e702b8bf76a5162f1ce5864a0525cf))
* **subscription:** add stripeSubscriptionId to user subscription status ([0d83177](https://github.com/janovix/auth-svc/commit/0d8317786ac3471d5021b4d4e4a14f4ce01e21a0))
* **subscription:** enhance organization creation logic in SubscriptionService tests ([164cde5](https://github.com/janovix/auth-svc/commit/164cde5b480aa00d993eceeebc6685a47c8b24ca))
* **subscription:** enhance subscription status retrieval with organization owner resolution ([7444e02](https://github.com/janovix/auth-svc/commit/7444e028482967b8f1c60e3ffd5c30e49c9c729c))
* **subscription:** implement license-based subscription handling and enhance user subscription queries ([63d60c3](https://github.com/janovix/auth-svc/commit/63d60c3466fc0830c6cfbc135e67b377f70d2b9c))
* **usage-rights:** implement usage rights and licensing system ([0a404f7](https://github.com/janovix/auth-svc/commit/0a404f762300413912665f8ad235c34596c098bd))

# [1.5.0-rc.2](https://github.com/janovix/auth-svc/compare/v1.5.0-rc.1...v1.5.0-rc.2) (2026-02-24)

### Features

* **migrations:** add stripeCustomerId column to users table for Better Auth integration ([1c59977](https://github.com/janovix/auth-svc/commit/1c5997749e56b0798d4d412ffc14efce1f192505))

# [1.5.0-rc.1](https://github.com/janovix/auth-svc/compare/v1.4.0...v1.5.0-rc.1) (2026-02-23)


### Bug Fixes

* **api-keys:** correct eligibility check for business plan in tests ([969c068](https://github.com/janovix/auth-svc/commit/969c06894f75e0c617eda976314ae98a6a77d165))
* **auth:** add cleanup for execution context on validation and auth failures ([be3d58e](https://github.com/janovix/auth-svc/commit/be3d58ea7f9864c5289c883cfd3122e570896d44))
* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))
* **auth:** update rate limits for various environments ([e14d369](https://github.com/janovix/auth-svc/commit/e14d369d904f5a41635dc6ad879c239992656b0b))
* **notifications:** enhance notification dispatch logging and error handling for organization updates ([475266c](https://github.com/janovix/auth-svc/commit/475266c08be1b8961ba0e777c2ff673663761ced))
* **subscription:** query user role directly from database to avoid stale session data ([75bf58a](https://github.com/janovix/auth-svc/commit/75bf58a9b1ed4b243ba7f8a1c90655efc801ee44))


### Features

* **admin:** add admin statistics and KV management endpoints ([11bb19e](https://github.com/janovix/auth-svc/commit/11bb19e39e3683f3ce2d244bc6d7a178234020dc))
* **admin:** implement admin organizations routes and replace internal organizations access ([81f3ca0](https://github.com/janovix/auth-svc/commit/81f3ca09a76ada214f90282e63e8ec570f621090))
* **aml-settings:** add AML Compliance Settings proxy routes and OpenAPI documentation ([d246f4d](https://github.com/janovix/auth-svc/commit/d246f4d3ff9c8c8a0918feb5c5fa5e9e4b4aaa29))
* **api-keys:** add enterprise plan to API access validation ([f4d1153](https://github.com/janovix/auth-svc/commit/f4d1153c784aec0afe0d22912ed02506736f6390))
* **api-keys:** implement API keys management for organization-scoped access ([32a42db](https://github.com/janovix/auth-svc/commit/32a42dbe1b9c0534012ab84607f694b1500be299))
* **api-keys:** integrate jose for JWT signing and enhance ephemeral JWT creation ([ef27550](https://github.com/janovix/auth-svc/commit/ef275509e30a332c8c98d3dc49c526e8da3ba4e9))
* **api-keys:** update API_ENABLED_PLANS to include 'business' plan ([6932cee](https://github.com/janovix/auth-svc/commit/6932ceee84ca63275c307dd7496b5e989ea040ed))
* **auth:** add error handling configuration for API errors and update public route list ([2053704](https://github.com/janovix/auth-svc/commit/205370437ac45fb59db5b3f5c6a2df26da6ba2e5))
* **auth:** add Google OAuth configuration for social login ([9c44357](https://github.com/janovix/auth-svc/commit/9c443570856c5045b5018ed7f50b9c905f6a1ec9))
* **auth:** add OAuth provider callback routes to public access list ([f272e07](https://github.com/janovix/auth-svc/commit/f272e0716997abfa2516c30f98d0d4e7c82aac63))
* **auth:** enhance organization limit checks with enterprise license support ([977e650](https://github.com/janovix/auth-svc/commit/977e6503bdb94e3ad41fd0ef8a2106cd34d52b7b))
* **auth:** enhance rate limiting with custom storage for KV environments ([459cc8b](https://github.com/janovix/auth-svc/commit/459cc8b2df58d127a9fc6a64083d560c2115d3d1)), closes [hi#frequency](https://github.com/hi/issues/frequency)
* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** establish execution context for all routes ([b49c269](https://github.com/janovix/auth-svc/commit/b49c2697ced8112ffb624c464b3a210e1ff31b28))
* **auth:** implement custom rate limit rules for OTP endpoints and configure storage options across environments ([e68b486](https://github.com/janovix/auth-svc/commit/e68b486a2afe9ffa6c448d20025eded68876c4f8))
* **auth:** implement dedicated JWKS endpoint handler ([351f240](https://github.com/janovix/auth-svc/commit/351f240084c2c9168bc20e920da8890abda59d0a))
* **auth:** implement user promotion from visitor to user based on pending invitations ([26efe7c](https://github.com/janovix/auth-svc/commit/26efe7c199d0e09211c8c2f6732bc47dabf97888))
* **auth:** implement visitor role and promote endpoint for beta access ([0059eff](https://github.com/janovix/auth-svc/commit/0059eff8fa6eb13f80768ff209a7b44ecc1f6ea4))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))
* **auth:** integrate Sentry for enhanced error tracking ([39dc5e7](https://github.com/janovix/auth-svc/commit/39dc5e7683be17d43de736b2b54a8aad85eeeb12))
* **cors:** consistently expose X-Retry-After header in CORS responses ([e4ce4c2](https://github.com/janovix/auth-svc/commit/e4ce4c2f37e52f94f4510b76505d017123c71e6c))
* **cors:** expose X-Retry-After header in CORS middleware ([374db60](https://github.com/janovix/auth-svc/commit/374db606ed523441ae468f818071c8621ce64bc9))
* **logging:** integrate Sentry for error tracking and remove excessive logging ([160bb60](https://github.com/janovix/auth-svc/commit/160bb60cbcc5c0dd983dc55994a316e65071f3ea))
* **notifications:** add absolute callbackUrl to org settings notification ([30bbf07](https://github.com/janovix/auth-svc/commit/30bbf079520760916137b609c32f36b70d915531))
* **notifications:** add notifications service binding and dispatch logic for organization updates ([1f78692](https://github.com/janovix/auth-svc/commit/1f786920d41f14076596804f2ed38d51d3774cb6))
* **passkey:** add support for Better Auth passkey plugin ([a3dd710](https://github.com/janovix/auth-svc/commit/a3dd710e7996e3146abf569ba0b9c07a9cac8001))
* **pricing, subscription:** enhance license activation and subscription organization limit checks ([08dd7d3](https://github.com/janovix/auth-svc/commit/08dd7d3fc97f38a2e7f0f78c513483bb2c9732a0))
* **pricing:** add license management features for superseding and revoking licenses ([0c53f69](https://github.com/janovix/auth-svc/commit/0c53f69864b827b55b96f3aae2bc6ad68284f3a5))
* **routes:** add internal organizations route for member enumeration ([8bb897e](https://github.com/janovix/auth-svc/commit/8bb897e6d77c4ccba06d9b5d13d6d94d317e353f))
* **subscription-admin:** add subscription management routes for admin ([be0789e](https://github.com/janovix/auth-svc/commit/be0789e883e702b8bf76a5162f1ce5864a0525cf))
* **subscription:** add stripeSubscriptionId to user subscription status ([0d83177](https://github.com/janovix/auth-svc/commit/0d8317786ac3471d5021b4d4e4a14f4ce01e21a0))
* **subscription:** enhance organization creation logic in SubscriptionService tests ([164cde5](https://github.com/janovix/auth-svc/commit/164cde5b480aa00d993eceeebc6685a47c8b24ca))
* **subscription:** enhance subscription status retrieval with organization owner resolution ([7444e02](https://github.com/janovix/auth-svc/commit/7444e028482967b8f1c60e3ffd5c30e49c9c729c))
* **subscription:** implement license-based subscription handling and enhance user subscription queries ([63d60c3](https://github.com/janovix/auth-svc/commit/63d60c3466fc0830c6cfbc135e67b377f70d2b9c))
* **usage-rights:** implement usage rights and licensing system ([0a404f7](https://github.com/janovix/auth-svc/commit/0a404f762300413912665f8ad235c34596c098bd))

# [1.4.0-rc.62](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.61...v1.4.0-rc.62) (2026-02-20)


### Features

* **subscription:** enhance organization creation logic in SubscriptionService tests ([164cde5](https://github.com/janovix/auth-svc/commit/164cde5b480aa00d993eceeebc6685a47c8b24ca))

# [1.4.0-rc.61](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.60...v1.4.0-rc.61) (2026-02-20)


### Features

* **routes:** add internal organizations route for member enumeration ([8bb897e](https://github.com/janovix/auth-svc/commit/8bb897e6d77c4ccba06d9b5d13d6d94d317e353f))

# [1.4.0-rc.60](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.59...v1.4.0-rc.60) (2026-02-19)


### Bug Fixes

* **auth:** update rate limits for various environments ([e14d369](https://github.com/janovix/auth-svc/commit/e14d369d904f5a41635dc6ad879c239992656b0b))

# [1.4.0-rc.59](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.58...v1.4.0-rc.59) (2026-02-19)


### Features

* **auth:** establish execution context for all routes ([b49c269](https://github.com/janovix/auth-svc/commit/b49c2697ced8112ffb624c464b3a210e1ff31b28))

# [1.4.0-rc.58](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.57...v1.4.0-rc.58) (2026-02-18)


### Features

* **api-keys:** add enterprise plan to API access validation ([f4d1153](https://github.com/janovix/auth-svc/commit/f4d1153c784aec0afe0d22912ed02506736f6390))

# [1.4.0-rc.57](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.56...v1.4.0-rc.57) (2026-02-18)


### Features

* **subscription:** add stripeSubscriptionId to user subscription status ([0d83177](https://github.com/janovix/auth-svc/commit/0d8317786ac3471d5021b4d4e4a14f4ce01e21a0))

# [1.4.0-rc.56](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.55...v1.4.0-rc.56) (2026-02-18)


### Features

* **auth:** enhance rate limiting with custom storage for KV environments ([459cc8b](https://github.com/janovix/auth-svc/commit/459cc8b2df58d127a9fc6a64083d560c2115d3d1)), closes [hi#frequency](https://github.com/hi/issues/frequency)

# [1.4.0-rc.55](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.54...v1.4.0-rc.55) (2026-02-18)


### Features

* **aml-settings:** add AML Compliance Settings proxy routes and OpenAPI documentation ([d246f4d](https://github.com/janovix/auth-svc/commit/d246f4d3ff9c8c8a0918feb5c5fa5e9e4b4aaa29))

# [1.4.0-rc.54](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.53...v1.4.0-rc.54) (2026-02-18)


### Features

* **auth:** implement dedicated JWKS endpoint handler ([351f240](https://github.com/janovix/auth-svc/commit/351f240084c2c9168bc20e920da8890abda59d0a))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-17)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))
* **auth:** integrate Sentry for enhanced error tracking ([39dc5e7](https://github.com/janovix/auth-svc/commit/39dc5e7683be17d43de736b2b54a8aad85eeeb12))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-17)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))
* **auth:** integrate Sentry for enhanced error tracking ([39dc5e7](https://github.com/janovix/auth-svc/commit/39dc5e7683be17d43de736b2b54a8aad85eeeb12))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-17)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-16)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))
* **auth:** integrate captcha plugin for enhanced bot protection ([cbf3853](https://github.com/janovix/auth-svc/commit/cbf3853ac9e0e5123cd05fb6152419dbbac5077f))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-16)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** improve email OTP handling and cleanup timing ([ae5cec4](https://github.com/janovix/auth-svc/commit/ae5cec4a862f323a7e9423b96217c32724742c9f))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-13)


### Bug Fixes

* **auth:** enhance cache management for Stripe integration ([249122d](https://github.com/janovix/auth-svc/commit/249122d21caf3a2d0d413a521892399d7c3cafa6))
* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-13)


### Bug Fixes

* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))


### Features

* **auth:** enhance Stripe integration by conditionally fetching prices ([77a2e2c](https://github.com/janovix/auth-svc/commit/77a2e2c1641049eb1cd019b10910e9fb39649cb5))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-13)


### Bug Fixes

* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))
* **auth:** update cookieCache maxAge to enhance session management ([884e0bb](https://github.com/janovix/auth-svc/commit/884e0bbb5f00c34070a0424b670fa3c090913768))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-13)


### Bug Fixes

* **auth:** refine cookieCache settings and enhance CORS header handling ([ba0229e](https://github.com/janovix/auth-svc/commit/ba0229e9e43fcaef00415a61f0c36282c3a8eb74))
* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))

# [1.4.0-rc.53](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.52...v1.4.0-rc.53) (2026-02-13)


### Bug Fixes

* **auth:** update cookieCache maxAge for improved session handling ([07726e4](https://github.com/janovix/auth-svc/commit/07726e4169193c66da4e3a105b5db1321cc12096))

# [1.4.0-rc.52](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.51...v1.4.0-rc.52) (2026-02-13)


### Features

* **logging:** integrate Sentry for error tracking and remove excessive logging ([160bb60](https://github.com/janovix/auth-svc/commit/160bb60cbcc5c0dd983dc55994a316e65071f3ea))

# [1.4.0-rc.51](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.50...v1.4.0-rc.51) (2026-02-13)


### Features

* **cors:** consistently expose X-Retry-After header in CORS responses ([e4ce4c2](https://github.com/janovix/auth-svc/commit/e4ce4c2f37e52f94f4510b76505d017123c71e6c))

# [1.4.0-rc.50](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.49...v1.4.0-rc.50) (2026-02-13)


### Features

* **cors:** expose X-Retry-After header in CORS middleware ([374db60](https://github.com/janovix/auth-svc/commit/374db606ed523441ae468f818071c8621ce64bc9))

# [1.4.0-rc.49](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.48...v1.4.0-rc.49) (2026-02-12)


### Features

* **subscription:** enhance subscription status retrieval with organization owner resolution ([7444e02](https://github.com/janovix/auth-svc/commit/7444e028482967b8f1c60e3ffd5c30e49c9c729c))

# [1.4.0-rc.48](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.47...v1.4.0-rc.48) (2026-02-12)


### Features

* **subscription:** implement license-based subscription handling and enhance user subscription queries ([63d60c3](https://github.com/janovix/auth-svc/commit/63d60c3466fc0830c6cfbc135e67b377f70d2b9c))

# [1.4.0-rc.47](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.46...v1.4.0-rc.47) (2026-02-12)


### Features

* **auth:** enhance organization limit checks with enterprise license support ([977e650](https://github.com/janovix/auth-svc/commit/977e6503bdb94e3ad41fd0ef8a2106cd34d52b7b))

# [1.4.0-rc.46](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.45...v1.4.0-rc.46) (2026-02-12)


### Features

* **pricing, subscription:** enhance license activation and subscription organization limit checks ([08dd7d3](https://github.com/janovix/auth-svc/commit/08dd7d3fc97f38a2e7f0f78c513483bb2c9732a0))

# [1.4.0-rc.45](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.44...v1.4.0-rc.45) (2026-02-12)


### Features

* **subscription-admin:** add subscription management routes for admin ([be0789e](https://github.com/janovix/auth-svc/commit/be0789e883e702b8bf76a5162f1ce5864a0525cf))

# [1.4.0-rc.44](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.43...v1.4.0-rc.44) (2026-02-12)


### Features

* **pricing:** add license management features for superseding and revoking licenses ([0c53f69](https://github.com/janovix/auth-svc/commit/0c53f69864b827b55b96f3aae2bc6ad68284f3a5))

# [1.4.0-rc.43](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.42...v1.4.0-rc.43) (2026-02-12)


### Features

* **usage-rights:** implement usage rights and licensing system ([0a404f7](https://github.com/janovix/auth-svc/commit/0a404f762300413912665f8ad235c34596c098bd))

# [1.4.0-rc.42](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.41...v1.4.0-rc.42) (2026-02-11)


### Bug Fixes

* **subscription:** query user role directly from database to avoid stale session data ([75bf58a](https://github.com/janovix/auth-svc/commit/75bf58a9b1ed4b243ba7f8a1c90655efc801ee44))

# [1.4.0-rc.41](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.40...v1.4.0-rc.41) (2026-02-11)


### Features

* **auth:** implement user promotion from visitor to user based on pending invitations ([26efe7c](https://github.com/janovix/auth-svc/commit/26efe7c199d0e09211c8c2f6732bc47dabf97888))

# [1.4.0-rc.40](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.39...v1.4.0-rc.40) (2026-02-10)


### Bug Fixes

* **auth:** add cleanup for execution context on validation and auth failures ([be3d58e](https://github.com/janovix/auth-svc/commit/be3d58ea7f9864c5289c883cfd3122e570896d44))

# [1.4.0-rc.39](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.38...v1.4.0-rc.39) (2026-02-08)


### Features

* **api-keys:** integrate jose for JWT signing and enhance ephemeral JWT creation ([ef27550](https://github.com/janovix/auth-svc/commit/ef275509e30a332c8c98d3dc49c526e8da3ba4e9))

# [1.4.0-rc.38](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.37...v1.4.0-rc.38) (2026-02-08)


### Bug Fixes

* **api-keys:** correct eligibility check for business plan in tests ([969c068](https://github.com/janovix/auth-svc/commit/969c06894f75e0c617eda976314ae98a6a77d165))


### Features

* **api-keys:** update API_ENABLED_PLANS to include 'business' plan ([6932cee](https://github.com/janovix/auth-svc/commit/6932ceee84ca63275c307dd7496b5e989ea040ed))

# [1.4.0-rc.37](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.36...v1.4.0-rc.37) (2026-02-07)


### Features

* **api-keys:** implement API keys management for organization-scoped access ([32a42db](https://github.com/janovix/auth-svc/commit/32a42dbe1b9c0534012ab84607f694b1500be299))

# [1.4.0-rc.36](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.35...v1.4.0-rc.36) (2026-02-06)


### Features

* **admin:** add admin statistics and KV management endpoints ([11bb19e](https://github.com/janovix/auth-svc/commit/11bb19e39e3683f3ce2d244bc6d7a178234020dc))

# [1.4.0-rc.35](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.34...v1.4.0-rc.35) (2026-02-06)


### Features

* **admin:** implement admin organizations routes and replace internal organizations access ([81f3ca0](https://github.com/janovix/auth-svc/commit/81f3ca09a76ada214f90282e63e8ec570f621090))

# [1.4.0-rc.34](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.33...v1.4.0-rc.34) (2026-02-06)


### Features

* **auth:** implement custom rate limit rules for OTP endpoints and configure storage options across environments ([e68b486](https://github.com/janovix/auth-svc/commit/e68b486a2afe9ffa6c448d20025eded68876c4f8))

# [1.4.0-rc.33](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.32...v1.4.0-rc.33) (2026-02-05)


### Features

* **auth:** add error handling configuration for API errors and update public route list ([2053704](https://github.com/janovix/auth-svc/commit/205370437ac45fb59db5b3f5c6a2df26da6ba2e5))

# [1.4.0-rc.32](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.31...v1.4.0-rc.32) (2026-01-29)


### Features

* **auth:** add OAuth provider callback routes to public access list ([f272e07](https://github.com/janovix/auth-svc/commit/f272e0716997abfa2516c30f98d0d4e7c82aac63))

# [1.4.0-rc.31](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.30...v1.4.0-rc.31) (2026-01-28)


### Features

* **auth:** add Google OAuth configuration for social login ([9c44357](https://github.com/janovix/auth-svc/commit/9c443570856c5045b5018ed7f50b9c905f6a1ec9))

# [1.4.0-rc.30](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.29...v1.4.0-rc.30) (2026-01-27)


### Features

* **notifications:** add absolute callbackUrl to org settings notification ([30bbf07](https://github.com/janovix/auth-svc/commit/30bbf079520760916137b609c32f36b70d915531))

# [1.4.0-rc.29](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.28...v1.4.0-rc.29) (2026-01-24)


### Bug Fixes

* **notifications:** enhance notification dispatch logging and error handling for organization updates ([475266c](https://github.com/janovix/auth-svc/commit/475266c08be1b8961ba0e777c2ff673663761ced))

# [1.4.0-rc.28](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.27...v1.4.0-rc.28) (2026-01-24)


### Features

* **notifications:** add notifications service binding and dispatch logic for organization updates ([1f78692](https://github.com/janovix/auth-svc/commit/1f786920d41f14076596804f2ed38d51d3774cb6))

# [1.4.0-rc.27](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.26...v1.4.0-rc.27) (2026-01-22)


### Features

* **auth:** implement visitor role and promote endpoint for beta access ([0059eff](https://github.com/janovix/auth-svc/commit/0059eff8fa6eb13f80768ff209a7b44ecc1f6ea4))

# [1.4.0-rc.26](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.25...v1.4.0-rc.26) (2026-01-19)


### Features

* **auth:** implement auto-selection of user's first organization during session creation ([1ca7848](https://github.com/janovix/auth-svc/commit/1ca784867953c066b65d65ce01a53b73e861ee6a))

# [1.4.0-rc.25](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.24...v1.4.0-rc.25) (2026-01-19)


### Bug Fixes

* **seed-plans:** update monthly subscription price to $9,999 MXN ([8a823d5](https://github.com/janovix/auth-svc/commit/8a823d5f40e3cf0a495fa888a54f82c403d26ac3))

# [1.4.0-rc.24](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.23...v1.4.0-rc.24) (2026-01-17)


### Bug Fixes

* **auth:** update cleanup strategy for execution context to prevent premature cleanup of background tasks ([f3a5c0e](https://github.com/janovix/auth-svc/commit/f3a5c0e22f6413a1ace733466bd044cd14adc1d3))

# [1.4.0-rc.23](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.22...v1.4.0-rc.23) (2026-01-17)


### Features

* **auth:** improve logging for execution context and background task handling ([82fde64](https://github.com/janovix/auth-svc/commit/82fde64a0a340885b9dacee72ae7c0777df0d805))

# [1.4.0-rc.22](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.21...v1.4.0-rc.22) (2026-01-17)


### Bug Fixes

* **auth:** enhance error handling and logging in OTP email sending process ([1dd40b5](https://github.com/janovix/auth-svc/commit/1dd40b5bc7f884bb3e6306132715fe2de2b50672))

# [1.4.0-rc.21](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.20...v1.4.0-rc.21) (2026-01-16)


### Features

* **auth:** implement timeout handling for Stripe API calls and enhance execution context management ([dc90923](https://github.com/janovix/auth-svc/commit/dc90923174ab7b9182a085f320e95fb71da010ee))

# [1.4.0-rc.20](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.19...v1.4.0-rc.20) (2026-01-16)


### Features

* **auth:** optimize request body handling to prevent stream exhaustion in Cloudflare Workers ([6b28db2](https://github.com/janovix/auth-svc/commit/6b28db216a43ae52b3434664dfd634986339a6cc))


### Reverts

* Revert "feat(auth, kv-storage): implement timeout handling for auth requests and KV operations to prevent indefinite hangs" ([8ff552b](https://github.com/janovix/auth-svc/commit/8ff552bac777cac57ba22b1ef53213b441eea59e))

# [1.4.0-rc.19](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.18...v1.4.0-rc.19) (2026-01-16)


### Features

* **auth, kv-storage:** implement timeout handling for auth requests and KV operations to prevent indefinite hangs ([1665cbc](https://github.com/janovix/auth-svc/commit/1665cbcc26c911ebb9e8c35260b2ffd205e00c19))

# [1.4.0-rc.18](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.17...v1.4.0-rc.18) (2026-01-16)


### Features

* **tests:** add tests for getBetterAuthContext and getBetterAuthContextAsync ([d51ff88](https://github.com/janovix/auth-svc/commit/d51ff88f0f1ebffaddcd5678b4f4f28ae790f6a3))

# [1.4.0-rc.17](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.16...v1.4.0-rc.17) (2026-01-16)


### Bug Fixes

* **tests:** update test expectations for new fields and mock pricing repo ([cdae0da](https://github.com/janovix/auth-svc/commit/cdae0da44cfde72d44d41cf3f62ccbc19a0f1c47))

# [1.4.0-rc.16](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.15...v1.4.0-rc.16) (2026-01-14)


### Features

* enhance invitation handling in internal organizations routes with raw SQL and email notifications ([44f62ae](https://github.com/janovix/auth-svc/commit/44f62aef2617c099bff56327dd38cde731517acd))

# [1.4.0-rc.15](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.14...v1.4.0-rc.15) (2026-01-14)


### Features

* implement dynamic execution context handling for background tasks ([c0d8940](https://github.com/janovix/auth-svc/commit/c0d8940d7ae6ba9bb0a0dc47c8c52eabf65c9ddd))

# [1.4.0-rc.14](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.13...v1.4.0-rc.14) (2026-01-14)


### Features

* enhance email and Turnstile verification with timeout handling and logging improvements ([ac91410](https://github.com/janovix/auth-svc/commit/ac91410d0d693c35515a909db4a6d9823017cbc1))

# [1.4.0-rc.13](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.12...v1.4.0-rc.13) (2026-01-14)


### Features

* implement member management and invitation handling in internal organizations routes ([8dc21c1](https://github.com/janovix/auth-svc/commit/8dc21c120c5ea4145ae25b334c23a001710e0965))

# [1.4.0-rc.12](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.11...v1.4.0-rc.12) (2026-01-14)


### Features

* add invitation management and organization update routes to internal organizations ([96ab49a](https://github.com/janovix/auth-svc/commit/96ab49a40d88a1ede8030e47d2656539dfbdfed1))

# [1.4.0-rc.11](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.10...v1.4.0-rc.11) (2026-01-14)


### Features

* add internal organizations route to the application ([1e044b3](https://github.com/janovix/auth-svc/commit/1e044b383195eb3c1cc22f370d761f7e67b55578))

# [1.4.0-rc.10](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.9...v1.4.0-rc.10) (2026-01-14)


### Features

* enhance JWT payload to include user role for authorization ([c43a5b2](https://github.com/janovix/auth-svc/commit/c43a5b2c3e70b715924a8054a67741705284a9c0))

# [1.4.0-rc.9](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.8...v1.4.0-rc.9) (2026-01-14)


### Features

* add admin routes and OpenAPI documentation for KV cache management ([b8e1df2](https://github.com/janovix/auth-svc/commit/b8e1df2eb9cf1f8fa27efb86981e0e9978297cad))
* integrate Better Auth Stripe plugin for user-based billing and organization usage tracking ([eb632ad](https://github.com/janovix/auth-svc/commit/eb632ad61d87628ffb2aeaf1c6e858d50cd0e417))

# [1.4.0-rc.8](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.7...v1.4.0-rc.8) (2026-01-12)


### Bug Fixes

* correct subscription status test for none tier case ([5b0176d](https://github.com/janovix/auth-svc/commit/5b0176dc4bc4ac999b63c469cc4f0feaef58068e))

# [1.4.0-rc.7](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.6...v1.4.0-rc.7) (2026-01-12)


### Features

* add internal organizations API for admin panel ([f5c668c](https://github.com/janovix/auth-svc/commit/f5c668c3c288db31e58ed60c1882dc377555cb8a))

# [1.4.0-rc.6](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.5...v1.4.0-rc.6) (2026-01-12)


### Features

* add seeding script for subscription plans and update SQL seed file ([e216af6](https://github.com/janovix/auth-svc/commit/e216af6d45ba843cebc797f6d936a272c28289b2))

# [1.4.0-rc.5](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.4...v1.4.0-rc.5) (2026-01-12)


### Features

* update OpenAPI documentation and add subscription and license management endpoints ([97f3559](https://github.com/janovix/auth-svc/commit/97f3559dee7ba6ab9ba04a222c591c0853ffc7b2))

# [1.4.0-rc.4](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.3...v1.4.0-rc.4) (2026-01-12)


### Bug Fixes

* remove invalid column rename in migration 0008 ([6fb8782](https://github.com/janovix/auth-svc/commit/6fb8782c4a937f3e0cbc7e809fca035a1c96599f))


### Features

* implement subscription and license management with Stripe integration ([e91716e](https://github.com/janovix/auth-svc/commit/e91716e5ace466cd307e745edac73b95a76864ae))

# [1.4.0-rc.3](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.2...v1.4.0-rc.3) (2026-01-11)


### Bug Fixes

* refactor AML settings proxy routes to improve error handling and logging ([84188f8](https://github.com/janovix/auth-svc/commit/84188f840a08bf71922ef669fba5596c4b618c2f))

# [1.4.0-rc.2](https://github.com/janovix/auth-svc/compare/v1.4.0-rc.1...v1.4.0-rc.2) (2026-01-11)


### Features

* add AML compliance settings proxy routes and update service bindings ([7b4cd8d](https://github.com/janovix/auth-svc/commit/7b4cd8d514ff86b60eb6013cb3e6151dd2ee36f2))

# [1.4.0-rc.1](https://github.com/janovix/auth-svc/compare/v1.3.1...v1.4.0-rc.1) (2026-01-11)


### Features

* add user and organization settings management with audit logging ([0168963](https://github.com/janovix/auth-svc/commit/0168963dd2da88459a82e6e33fa2e19559695d1b))

## [1.3.1](https://github.com/janovix/auth-svc/compare/v1.3.0...v1.3.1) (2026-01-10)


### Bug Fixes

* wrong name for sourcemaps uploading ([7e659b1](https://github.com/janovix/auth-svc/commit/7e659b197595398c106a43d0afc9feac405362dc))

## [1.3.1-rc.1](https://github.com/janovix/auth-svc/compare/v1.3.0...v1.3.1-rc.1) (2026-01-10)


### Bug Fixes

* wrong name for sourcemaps uploading ([7e659b1](https://github.com/janovix/auth-svc/commit/7e659b197595398c106a43d0afc9feac405362dc))

# [1.3.0](https://github.com/janovix/auth-svc/compare/v1.2.0...v1.3.0) (2026-01-10)


### Features

* integrate Sentry for error tracking and monitoring, update deployment scripts, and add new environment variables ([0f560d2](https://github.com/janovix/auth-svc/commit/0f560d24e7fe4a335507a018fe5bda89b1ed79aa))

# [1.2.0](https://github.com/janovix/auth-svc/compare/v1.1.0...v1.2.0) (2026-01-08)
# [1.2.0-rc.2](https://github.com/janovix/auth-svc/compare/v1.2.0-rc.1...v1.2.0-rc.2) (2026-01-08)


### Bug Fixes

* restore JWT definePayload with organizationId and org plugin options ([9f50b7c](https://github.com/janovix/auth-svc/commit/9f50b7cc74461be5083dfc77011dc14ac9353b4b))


### Features

* integrate Sentry for error tracking and monitoring, update deployment scripts, and add new environment variables ([0f560d2](https://github.com/janovix/auth-svc/commit/0f560d24e7fe4a335507a018fe5bda89b1ed79aa))

# [1.2.0-rc.1](https://github.com/janovix/auth-svc/compare/v1.1.0...v1.2.0-rc.1) (2026-01-08)


### Bug Fixes

* restore JWT definePayload with organizationId and org plugin options ([9f50b7c](https://github.com/janovix/auth-svc/commit/9f50b7cc74461be5083dfc77011dc14ac9353b4b))


### Features

* add admin, emailOTP, openAPI plugins with janovix.com domain ([60f4d57](https://github.com/janovix/auth-svc/commit/60f4d57463b2e8e349977a115384975aa3e9f545))
* **auth:** enhance organization invitation flow and update test command ([2c3a91f](https://github.com/janovix/auth-svc/commit/2c3a91f0d6ab0abd204f18cee6d53ca8ba2f67a3))
* Improve error handling and add org invitation email ([686422a](https://github.com/janovix/auth-svc/commit/686422a280fe3ad0464ba9aabe060160ac2819df))

# [1.1.0](https://github.com/janovix/auth-svc/compare/v1.0.0...v1.1.0) (2025-12-30)

### Bug Fixes

* **auth:** allow verify-email and reset-password routes without token ([ff9e8b5](https://github.com/janovix/auth-svc/commit/ff9e8b52914a6424e1b959a9863d181ef96364e7))
* **auth:** redirect to frontend after email verification ([b9269d5](https://github.com/janovix/auth-svc/commit/b9269d5302d7087dac6b8f74741162556f906e47))
* await Mandrill API call so waitUntil tracks it correctly ([d74a1f0](https://github.com/janovix/auth-svc/commit/d74a1f0ba5f29dd4e80e84a65a4ec521741572e3))
* exclude openapi.ts from coverage requirements ([c2f09f7](https://github.com/janovix/auth-svc/commit/c2f09f7a6b76f0aa58cbcc9a6dd376976776703e))
* from name sending function ([b817a98](https://github.com/janovix/auth-svc/commit/b817a98421be760e7d1c617007b01242527a1885))
* removed messages in cors middleware ([3d1a92b](https://github.com/janovix/auth-svc/commit/3d1a92b7d29a7696a409c30efe1a9fa41ed6ac82))
* update Mandrill API endpoint to include .json extension ([23344d1](https://github.com/janovix/auth-svc/commit/23344d1e6f039b5254ecea2ff1fcb9673812ec73))

### Features

* Add auth config and integration tests ([0ad57c0](https://github.com/janovix/auth-svc/commit/0ad57c055a440cd76d550ef8183013291e1c35a5))
* add comprehensive debug logging for password reset emails ([95d6879](https://github.com/janovix/auth-svc/commit/95d68796795f9cbce5d350920cd09343029fda9a))
* add comprehensive logging and waitUntil support for password reset ([46cef05](https://github.com/janovix/auth-svc/commit/46cef052b27759ffbe68c6554d72d32872d85de3))
* add email verification support ([4551ece](https://github.com/janovix/auth-svc/commit/4551ece29133c038acbe5628c2fe8f05cca347e9))
* add inline images to password reset email template ([d4c1ee2](https://github.com/janovix/auth-svc/commit/d4c1ee28fe97cf48f359ace480f02daf49842ec8))
* add Mandrill response logging and callback trigger logging ([caa2da8](https://github.com/janovix/auth-svc/commit/caa2da8d15bf26372f3578f6465a56a85dfdc674))
* add Turnstile validation for password reset requests ([ac1a4e9](https://github.com/janovix/auth-svc/commit/ac1a4e9e7a6197f4b98bed14d1551b6118b8097a))
* **auth:** add multi-tenant organization support ([3cce3d8](https://github.com/janovix/auth-svc/commit/3cce3d8f7f7bf26b9d12de617e3ac9e805e7498b))
* Bundle kysely for Workers environment ([7225b32](https://github.com/janovix/auth-svc/commit/7225b3251ab9692e1ef09bd09368ecf3627e4e99))
* implement password reset with Mandrill email integration ([c9fe6a3](https://github.com/janovix/auth-svc/commit/c9fe6a3af26209d4aec877f9353c4fef5ab29a18))
* require email verification before sign-in ([3c861cd](https://github.com/janovix/auth-svc/commit/3c861cda485b510466d4cc9f451414b39d10fc54))
* send frontend URL in password reset email instead of backend ([8e20bdd](https://github.com/janovix/auth-svc/commit/8e20bdd5e4b24a3bc2a64c4a08fff9c9accaf24c))


### Performance Improvements

* add KV secondary storage for Better Auth and remove hot-path queries ([73a408f](https://github.com/janovix/auth-svc/commit/73a408f9723e66322c35a262e75369abf7d25a6a))

# [1.1.0-rc.6](https://github.com/janovix/auth-svc/compare/v1.1.0-rc.5...v1.1.0-rc.6) (2026-01-08)

### Bug Fixes

* restore JWT definePayload with organizationId and org plugin options ([9f50b7c](https://github.com/janovix/auth-svc/commit/9f50b7cc74461be5083dfc77011dc14ac9353b4b))


# [1.1.0-rc.5](https://github.com/janovix/auth-svc/compare/v1.1.0-rc.4...v1.1.0-rc.5) (2026-01-08)


### Features

* add admin, emailOTP, openAPI plugins with janovix.com domain ([60f4d57](https://github.com/janovix/auth-svc/commit/60f4d57463b2e8e349977a115384975aa3e9f545))

# [1.1.0-rc.4](https://github.com/janovix/auth-svc/compare/v1.1.0-rc.3...v1.1.0-rc.4) (2025-12-30)


### Features

* Improve error handling and add org invitation email ([686422a](https://github.com/janovix/auth-svc/commit/686422a280fe3ad0464ba9aabe060160ac2819df))

# [1.1.0-rc.3](https://github.com/janovix/auth-svc/compare/v1.1.0-rc.2...v1.1.0-rc.3) (2025-12-30)


### Features

* **auth:** enhance organization invitation flow and update test command ([2c3a91f](https://github.com/janovix/auth-svc/commit/2c3a91f0d6ab0abd204f18cee6d53ca8ba2f67a3))


# [1.1.0-rc.2](https://github.com/janovix/auth-svc/compare/v1.1.0-rc.1...v1.1.0-rc.2) (2025-12-30)


### Features

* Add auth config and integration tests ([0ad57c0](https://github.com/janovix/auth-svc/commit/0ad57c055a440cd76d550ef8183013291e1c35a5))
* Bundle kysely for Workers environment ([7225b32](https://github.com/janovix/auth-svc/commit/7225b3251ab9692e1ef09bd09368ecf3627e4e99))

# [1.1.0-rc.1](https://github.com/janovix/auth-svc/compare/v1.0.0...v1.1.0-rc.1) (2025-12-30)


### Bug Fixes

* **auth:** allow verify-email and reset-password routes without token ([ff9e8b5](https://github.com/janovix/auth-svc/commit/ff9e8b52914a6424e1b959a9863d181ef96364e7))
* **auth:** redirect to frontend after email verification ([b9269d5](https://github.com/janovix/auth-svc/commit/b9269d5302d7087dac6b8f74741162556f906e47))
* await Mandrill API call so waitUntil tracks it correctly ([d74a1f0](https://github.com/janovix/auth-svc/commit/d74a1f0ba5f29dd4e80e84a65a4ec521741572e3))
* exclude openapi.ts from coverage requirements ([c2f09f7](https://github.com/janovix/auth-svc/commit/c2f09f7a6b76f0aa58cbcc9a6dd376976776703e))
* from name sending function ([b817a98](https://github.com/janovix/auth-svc/commit/b817a98421be760e7d1c617007b01242527a1885))
* removed messages in cors middleware ([3d1a92b](https://github.com/janovix/auth-svc/commit/3d1a92b7d29a7696a409c30efe1a9fa41ed6ac82))
* update Mandrill API endpoint to include .json extension ([23344d1](https://github.com/janovix/auth-svc/commit/23344d1e6f039b5254ecea2ff1fcb9673812ec73))


### Features

* add comprehensive debug logging for password reset emails ([95d6879](https://github.com/janovix/auth-svc/commit/95d68796795f9cbce5d350920cd09343029fda9a))
* add comprehensive logging and waitUntil support for password reset ([46cef05](https://github.com/janovix/auth-svc/commit/46cef052b27759ffbe68c6554d72d32872d85de3))
* add email verification support ([4551ece](https://github.com/janovix/auth-svc/commit/4551ece29133c038acbe5628c2fe8f05cca347e9))
* add inline images to password reset email template ([d4c1ee2](https://github.com/janovix/auth-svc/commit/d4c1ee28fe97cf48f359ace480f02daf49842ec8))
* add Mandrill response logging and callback trigger logging ([caa2da8](https://github.com/janovix/auth-svc/commit/caa2da8d15bf26372f3578f6465a56a85dfdc674))
* add Turnstile validation for password reset requests ([ac1a4e9](https://github.com/janovix/auth-svc/commit/ac1a4e9e7a6197f4b98bed14d1551b6118b8097a))
* **auth:** add multi-tenant organization support ([3cce3d8](https://github.com/janovix/auth-svc/commit/3cce3d8f7f7bf26b9d12de617e3ac9e805e7498b))
* implement password reset with Mandrill email integration ([c9fe6a3](https://github.com/janovix/auth-svc/commit/c9fe6a3af26209d4aec877f9353c4fef5ab29a18))
* require email verification before sign-in ([3c861cd](https://github.com/janovix/auth-svc/commit/3c861cda485b510466d4cc9f451414b39d10fc54))
* send frontend URL in password reset email instead of backend ([8e20bdd](https://github.com/janovix/auth-svc/commit/8e20bdd5e4b24a3bc2a64c4a08fff9c9accaf24c))


### Performance Improvements

* add KV secondary storage for Better Auth and remove hot-path queries ([73a408f](https://github.com/janovix/auth-svc/commit/73a408f9723e66322c35a262e75369abf7d25a6a))

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
