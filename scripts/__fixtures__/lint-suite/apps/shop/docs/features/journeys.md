# Journeys contract

What a customer does from end to end, across features. Each rule cites in its Source the feature
rules it chains.

## Business rules

| ID | Rule | Source |
|---|---|---|
| REQ-JOURNEY-01 | A customer signs in and finds the product in the basket. | chains REQ-LOGIN-11 and REQ-BASKET-01 |
| REQ-JOURNEY-02 | A customer signs in and leaves. | the story SHOP-9 | <!-- expect-finding: journey-chain -->
| REQ-JOURNEY-03 | A customer pays for the basket. | chains REQ-LOGIN-11 and REQ-CART-04 | <!-- expect-finding: journey-chain -->
| REQ-JOURNEY-04 | A customer pays twice. | chains REQ-JOURNEY-01 only | <!-- expect-finding: journey-chain -->
| REQ-JOURNEY-05 | A customer reads the basket after a reload. | REQ-BASKET-01, and the shell's own reload |
