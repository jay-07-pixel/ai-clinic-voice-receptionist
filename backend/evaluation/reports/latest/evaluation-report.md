# Clinic Voice AI Evaluation Report

- Generated at: `2026-07-31T16:07:11.438Z`
- Mode: `offline-simulation`
- Success rate: **100.0%**
- Passed: **12/12**

## Metrics

| Metric | Value |
| --- | ---: |
| Success Rate | 100.00% |
| Turns to Completion (avg) | 3.25 |
| Average Tool Calls | 5 |
| Average Booking Time (ms) | 476.9 |
| Redundant Questions (avg) | 0 |
| Backend Latency (ms) | 36.76 |
| Tool Latency (ms) | 50.05 |
| Retell Event Latency (ms) | 25.64 |
| Cliniko Sync Time (ms) | 69.4 |

## Per-language Statistics

| Language | Total | Passed | Success Rate | Avg Turns | Avg Tools | Avg Booking ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| english | 10 | 10 | 100.0% | 2.9 | 5 | 464.38 |
| hindi | 1 | 1 | 100.0% | 5 | 5 | 553 |
| mixed | 1 | 1 | 100.0% | 5 | 5 | 501 |

## Scenario Summary

| Scenario | Language | Result | Turns | Tools | Total ms | Failure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| English Booking | en | PASS | 5 | 5 | 506 |  |
| Hindi Booking | hi | PASS | 5 | 5 | 553 |  |
| Mixed Hindi-English Booking | mixed | PASS | 5 | 5 | 501 |  |
| Returning Patient | en | PASS | 3 | 4 | 372 |  |
| Dropped Call Recovery | en | PASS | 3 | 3 | 280 |  |
| Missed Callback Resume | en | PASS | 3 | 5 | 437 |  |
| Earliest Slot Across Branches | en | PASS | 3 | 5 | 483 |  |
| Reschedule | en | PASS | 2 | 5 | 364 |  |
| Cancel | en | PASS | 2 | 3 | 320 |  |
| Double Booking Prevention | en | PASS | 3 | 6 | 503 |  |
| Branch-specific Doctor Search | en | PASS | 2 | 7 | 558 |  |
| Stale Availability Refresh | en | PASS | 3 | 7 | 576 |  |

## Console Table

```
Scenario                           Lang     Result Turns  Tools  ms       Failure
----------------------------------------------------------------------------------------------------
English Booking                    en       PASS   5      5      506      
Hindi Booking                      hi       PASS   5      5      553      
Mixed Hindi-English Booking        mixed    PASS   5      5      501      
Returning Patient                  en       PASS   3      4      372      
Dropped Call Recovery              en       PASS   3      3      280      
Missed Callback Resume             en       PASS   3      5      437      
Earliest Slot Across Branches      en       PASS   3      5      483      
Reschedule                         en       PASS   2      5      364      
Cancel                             en       PASS   2      3      320      
Double Booking Prevention          en       PASS   3      6      503      
Branch-specific Doctor Search      en       PASS   2      7      558      
Stale Availability Refresh         en       PASS   3      7      576      
```

