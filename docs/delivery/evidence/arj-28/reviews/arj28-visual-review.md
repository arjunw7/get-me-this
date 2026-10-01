# ARJ-28 candidate visual review

- Reviewer: `/root/arj28_final_visual_review` (independent AI reviewer; not the human owner).
- Reviewed implementation: PR head `c6056324836a9c06b85034f52648911e2a4a50af`, CI merge head `69831868b846cf864c193090d9bd9e8195aed7b8`.
- Inspection: all 18 allowlisted candidate PNGs inspected at original resolution. Matched viewport sizes are mobile 390×844 and desktop 1440×1000. The packet covers nine states at both viewports: `manual-prefilled`, `manual-clean`, `validation`, `submission-conflict`, `save-failure`, `edit`, `delete-confirm`, `delete-uncertain`, and `success`.
- Route map: `manual-prefilled`, `manual-clean`, `validation`, `submission-conflict`, and `save-failure` use `/wishlist/items/new`; `edit`, `delete-confirm`, and `delete-uncertain` use `/wishlist/items/[itemId]/edit`; `success` uses `/wishlist` after the create action. The separate empty/filled actuals use `/wishlist` with the matching fixture state.
- Accessibility evidence: axe reports zero violations in all nine states at both viewports. Mobile report SHA-256 `af5113df28743ca84a021f5709a89a32b96dd94a5ca410d5498ab02491fbb3be`; desktop report SHA-256 `75c4316e3e5d0d493a97e7cf4be18a4b9eeaed782ea2682cec22a42f3e697f96`.
- Decision: approved the 18 candidate views and only the four empty/filled wishlist actual images below as visual baseline replacements. Reference and diff PNGs were not approved. This decision is tied to the reviewed head above. The `submission-conflict` state has since changed and requires recapture and new review before its candidate is accepted.
- Candidate packet manifest SHA-256: `25c87ae6dfa5cec565dd460b904f1bea71d91143d5e138d5b6903dbc4d26440a`. Source manifest: `/tmp/arj28-run-36796826965/arj28-responsive-candidates/manifest.json`.

| State | Viewport | Candidate SHA-256 |
| --- | --- | --- |
| delete-confirm | desktop | `eae4bb1ac005e0483ee07341f6e4da2db34b6ba622fbd28e0db449f1500ef9dd` |
| delete-confirm | mobile | `19fa8e419b71eec811c231c57f6d235d269be38c49a39b53536dc32fbf0e4364` |
| delete-uncertain | desktop | `14e7a04ba67885db1888e92b90fc895f937e2349e9ad4ca30502b15809a6b643` |
| delete-uncertain | mobile | `43531ecc17962c4021a35a3a953904de311adb528fd6b259ec22b8d7f18649f0` |
| edit | desktop | `50020200cc1c5406e536a68d507adebacc5c9bacdd6b889cf0503d27c3ce3205` |
| edit | mobile | `40c222239575105710d12224427ee3000d45016ee12dfd35282ed4f0550ff39d` |
| manual-clean | desktop | `07a1555e0bf6921d2dbeee03051b98ecb5a4d79787a920a99a08fac63edd8b18` |
| manual-clean | mobile | `54afe8af402324495867404d017e5ff6b4ad00905b8ef6fdbfed0518d982a638` |
| manual-prefilled | desktop | `42dcdaed0ac7423e7167644ad4731439ab60607dc2125b40010da4a2b3dc658d` |
| manual-prefilled | mobile | `2ed1a4e0ed808b3a773107734ac59315dbb93908aba807c763cd1a11dcb5b86f` |
| save-failure | desktop | `f4bfc7e26dfa445ce38ec78f950fe460a401aa818f665f528b77b329a497815c` |
| save-failure | mobile | `2a86dac1e06cb3bff128b941b1e2045d47dc8374880daf42bf722d1736f9b5e1` |
| submission-conflict | desktop | `6a63362f2096a2baf50b667434b985781dd9a8b859013e4c7c7a7c8befae93f6` |
| submission-conflict | mobile | `b23c1ec5f41861f82154a257ff36b4ee383ccf9d557321fe8d2b75f4ff6467dc` |
| success | desktop | `8d6fb6fe0707ce5479beafee77011792a21f5b80b4aebf00b5ea6ff152dc5e4c` |
| success | mobile | `d09777040a5d3eaea23cc5dcce4281bb796299ff2821eb13f36262537cbdb661` |
| validation | desktop | `39230b4e5c476d091cdc338621ec23cf8368282db69e5ad663568276e8ebd558` |
| validation | mobile | `7c89fb8335ea074383fed050655437cca6a8d57d8c86bf0358d866c6b8262060` |

The four approved actuals were captured on `/wishlist` with the matching empty or filled synthetic fixture:

| State | Viewport | Actual SHA-256 |
| --- | --- | --- |
| empty | mobile | `d6be52365b2de8001f53eb91e6545ea82ed8564e2f8eef513d5e413ea5e79ba0` |
| empty | desktop | `92eb523e95288ad878af6713ab88f1cac6fe97357645c7535a9d294367536b2e` |
| filled | mobile | `ef1ad35f37172faf9b74246537d2187564d769cedb3d58c9df22badba72fd043` |
| filled | desktop | `ee61134abad81c2d2010c26b6a82149731e92dd3d00981dbbf531200b64c18c4` |

No other baseline replacement is authorized by this review record.
