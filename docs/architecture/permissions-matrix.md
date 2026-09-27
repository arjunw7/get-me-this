# Permissions matrix

`Owner` means the owner of the wishlist item. `Eligible giver` means a joined group member permitted to gift under the current group mode.

| Resource/action | Signed out | Owner | Joined member | Eligible giver | Organizer |
|---|---:|---:|---:|---:|---:|
| View landing/auth | Yes | Yes | Yes | Yes | Yes |
| View limited invitation preview with valid token | Yes | Yes | Yes | Yes | Yes |
| View private group | No | Only if member | Yes | Yes | Yes if member |
| View member wishlist through shared group | No | Yes | Yes | Yes | Yes if member |
| Edit wishlist/item | No | Yes | No | No | No |
| React to another member's item | No | No | Yes | Yes | Yes if eligible |
| View visible reaction summary | No | Yes | Yes | Yes | Yes if member |
| Reserve an item | No | Never own item | Mode-dependent | Yes | Only if eligible giver |
| View reservation for recipient's item | No | **Never** | Mode-dependent | Yes when needed to prevent duplication | No special access |
| View who reserved own item | No | **Never** | N/A | N/A | **Never through organizer role** |
| View own assignment/checklist | No | N/A | Own only | Own only | Own only |
| View another member's assignment | No | No | No | No | No |
| Create/update group settings | No | No | No | No | Organizer only |
| Run/redraw secret draw | No | No | No | No | Organizer, confirmed and audited |
| Invite/remove members | No | No | No | No | Organizer |

## Required negative tests

- A non-member cannot enumerate groups, members, profiles, or items.
- A member cannot access a group after leaving/removal.
- A recipient cannot infer reservation state through direct table access, counts, activity, APIs, emails, or error differences.
- An organizer cannot use organizer status to read others' assignments or reservations.
- A user cannot reserve their own item.
- A user cannot react or reserve through a group where they are not joined/eligible.
- Guessing an invitation ID without the bearer token reveals nothing.
- Expired/revoked invitation tokens cannot create membership.
- Public client credentials cannot call service-role operations.

Every exposed table requires explicit grants, RLS policies, and allow/deny database tests in the same pull request.

