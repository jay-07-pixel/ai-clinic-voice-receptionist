# Backend API Contract & Service Architecture

**Status:** Design frozen for implementation  
**Scope:** Contracts, services, repositories, and request flows only  
**Out of scope:** Controllers, Prisma queries, business logic code, schema changes  

All payloads assume `application/json`. Timestamps are ISO-8601 UTC unless noted. Soft-deleted records (`deletedAt != null`) are excluded from public reads unless an endpoint explicitly supports recovery/admin views.

**Auth legend**

| Level | Meaning |
| ----- | ------- |
| `None` | Public (health only) |
| `Internal API Key` | Server-to-server (`X-API-Key`) — Retell tools, webhooks, workers |
| `Admin JWT` | Human operators / clinic admin console |
| `Webhook Signature` | Provider-signed request (Retell / Cliniko) |

**Standard error envelope**

```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message",
    "details": {},
    "requestId": "req_..."
  }
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `SLOT_UNAVAILABLE`, `POLICY_VIOLATION`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR`.

---

## 1. REST API Contract

Base path: `/api/v1` (except Health).

---

### 1.1 Health

#### `GET /health`

| | |
| --- | --- |
| **Purpose** | Liveness / readiness for load balancers and ops |
| **Auth** | None |

**Request:** none  

**Response `200`**

```json
{
  "status": "ok",
  "timestamp": "2026-07-31T12:00:00.000Z",
  "uptime": 120.5,
  "environment": "production",
  "checks": {
    "database": "ok",
    "cliniko": "degraded"
  }
}
```

**Errors:** `503` `{ "status": "unhealthy", ... }` when DB unreachable.

---

### 1.2 Patients

#### `GET /api/v1/patients/lookup`

| | |
| --- | --- |
| **Purpose** | Returning-patient lookup by phone and/or name |
| **Auth** | Internal API Key or Admin JWT |

**Request (query)**

```json
{
  "phone": "+919876543210",
  "fullName": "Riya Sharma",
  "dateOfBirth": "1990-05-12"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "found": true,
    "patient": {
      "id": "clpatient...",
      "firstName": "Riya",
      "lastName": "Sharma",
      "fullName": "Riya Sharma",
      "phone": "+919876543210",
      "phoneE164": "+919876543210",
      "email": "riya@example.com",
      "dateOfBirth": "1990-05-12",
      "gender": "FEMALE",
      "preferredLanguage": "hi",
      "isReturning": true
    },
    "matchConfidence": "high"
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `401`, `404` when no match (or `200` with `found: false` — prefer soft miss for voice).

Recommended voice contract: always `200` with `found: true|false` to avoid tool retries on 404.

---

#### `POST /api/v1/patients`

| | |
| --- | --- |
| **Purpose** | Register a new patient |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "firstName": "Aarav",
  "lastName": "Patel",
  "fullName": "Aarav Patel",
  "phone": "+919811122233",
  "email": "aarav@example.com",
  "dateOfBirth": "1988-01-20",
  "gender": "MALE",
  "preferredLanguage": "en",
  "idempotencyKey": "patient_create_..."
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "patient": {
      "id": "clpatient...",
      "fullName": "Aarav Patel",
      "phoneE164": "+919811122233",
      "isReturning": false,
      "createdAt": "2026-07-31T12:01:00.000Z"
    }
  }
}
```

**Errors:** `400`, `401`, `409 CONFLICT` (duplicate phone), `409 IDEMPOTENCY_CONFLICT`.

---

#### `GET /api/v1/patients/:patientId`

| | |
| --- | --- |
| **Purpose** | Fetch patient profile |
| **Auth** | Internal API Key or Admin JWT |

**Response `200`:** patient object (excludes soft-deleted).  

**Errors:** `401`, `404`.

---

#### `GET /api/v1/patients/:patientId/appointments`

| | |
| --- | --- |
| **Purpose** | List upcoming / recent appointments for a patient |
| **Auth** | Internal API Key or Admin JWT |

**Query:** `status`, `from`, `to`, `limit`  

**Response `200`**

```json
{
  "success": true,
  "data": {
    "appointments": []
  }
}
```

**Errors:** `400`, `401`, `404`.

---

### 1.3 Doctors

#### `GET /api/v1/doctors`

| | |
| --- | --- |
| **Purpose** | List active doctors, optionally filtered by branch/department |
| **Auth** | Internal API Key or Admin JWT |

**Query**

```json
{
  "branchId": "clbranch...",
  "departmentId": "cldept...",
  "q": "Mehta"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "doctors": [
      {
        "id": "cldoc...",
        "displayName": "Dr. Anil Mehta",
        "firstName": "Anil",
        "lastName": "Mehta",
        "title": "MD",
        "departments": [{ "id": "cldept...", "name": "General Medicine" }],
        "branches": [{ "id": "clbranch...", "name": "Andheri" }]
      }
    ]
  }
}
```

**Errors:** `400`, `401`.

---

#### `GET /api/v1/doctors/:doctorId`

| | |
| --- | --- |
| **Purpose** | Doctor detail including departments and branches |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

#### `GET /api/v1/doctors/:doctorId/schedule`

| | |
| --- | --- |
| **Purpose** | Weekly schedule + exceptions for a date range |
| **Auth** | Internal API Key or Admin JWT |

**Query:** `branchId`, `from`, `to`  

**Errors:** `400`, `401`, `404`.

---

### 1.4 Branches

#### `GET /api/v1/branches`

| | |
| --- | --- |
| **Purpose** | List clinic branches |
| **Auth** | Internal API Key or Admin JWT |

**Query:** `clinicId`, `isActive`  

**Response `200`**

```json
{
  "success": true,
  "data": {
    "branches": [
      {
        "id": "clbranch...",
        "clinicId": "clclinic...",
        "name": "Andheri West",
        "code": "AND",
        "city": "Mumbai",
        "timezone": "Asia/Kolkata",
        "phone": "+9122..."
      }
    ]
  }
}
```

**Errors:** `401`.

---

#### `GET /api/v1/branches/:branchId`

| | |
| --- | --- |
| **Purpose** | Branch detail |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

#### `GET /api/v1/branches/:branchId/departments`

| | |
| --- | --- |
| **Purpose** | Departments available at a branch |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

### 1.5 Appointments

All mutating appointment endpoints require `Idempotency-Key` header **or** body `idempotencyKey`.

#### `POST /api/v1/appointments`

| | |
| --- | --- |
| **Purpose** | Book an appointment against a concrete slot |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "patientId": "clpatient...",
  "slotId": "clslot...",
  "departmentId": "cldept...",
  "visitReason": "Fever and cough",
  "source": "VOICE_AI",
  "callSessionId": "clcall...",
  "idempotencyKey": "book_..."
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "appointment": {
      "id": "clappt...",
      "status": "CONFIRMED",
      "patientId": "clpatient...",
      "doctorId": "cldoc...",
      "branchId": "clbranch...",
      "slotId": "clslot...",
      "startsAt": "2026-08-01T04:30:00.000Z",
      "endsAt": "2026-08-01T04:45:00.000Z",
      "visitReason": "Fever and cough",
      "clinikoId": null
    }
  }
}
```

**Errors:** `400`, `401`, `404`, `409 SLOT_UNAVAILABLE`, `409 CONFLICT`, `409 IDEMPOTENCY_CONFLICT`, `422 POLICY_VIOLATION`.

---

#### `GET /api/v1/appointments/:appointmentId`

| | |
| --- | --- |
| **Purpose** | Get appointment by id |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

#### `POST /api/v1/appointments/:appointmentId/reschedule`

| | |
| --- | --- |
| **Purpose** | Move appointment to a new slot; preserves reschedule chain |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "newSlotId": "clslot_new...",
  "visitReason": "Follow-up",
  "callSessionId": "clcall...",
  "idempotencyKey": "resched_..."
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "previousAppointment": {
      "id": "clappt_old...",
      "status": "CANCELLED"
    },
    "appointment": {
      "id": "clappt_new...",
      "status": "CONFIRMED",
      "rescheduledFromId": "clappt_old...",
      "slotId": "clslot_new...",
      "startsAt": "2026-08-02T05:00:00.000Z",
      "endsAt": "2026-08-02T05:15:00.000Z"
    }
  }
}
```

**Errors:** `400`, `401`, `404`, `409 SLOT_UNAVAILABLE`, `422 POLICY_VIOLATION` (outside `rescheduleWindowHours`), `409 IDEMPOTENCY_CONFLICT`.

---

#### `POST /api/v1/appointments/:appointmentId/cancel`

| | |
| --- | --- |
| **Purpose** | Cancel appointment and free the slot |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "cancellationReason": "Patient unavailable",
  "callSessionId": "clcall...",
  "idempotencyKey": "cancel_..."
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "appointment": {
      "id": "clappt...",
      "status": "CANCELLED",
      "cancelledAt": "2026-07-31T12:10:00.000Z",
      "cancellationReason": "Patient unavailable"
    }
  }
}
```

**Errors:** `400`, `401`, `404`, `409 CONFLICT` (already cancelled/completed), `422 POLICY_VIOLATION` (outside `cancellationWindowHours`), `409 IDEMPOTENCY_CONFLICT`.

---

### 1.6 Availability

#### `GET /api/v1/availability`

| | |
| --- | --- |
| **Purpose** | Live availability search for a doctor/branch/department window |
| **Auth** | Internal API Key or Admin JWT |

**Query**

```json
{
  "branchId": "clbranch...",
  "doctorId": "cldoc...",
  "departmentId": "cldept...",
  "from": "2026-08-01T00:00:00.000Z",
  "to": "2026-08-07T23:59:59.000Z",
  "limit": 20
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "slots": [
      {
        "id": "clslot...",
        "doctorId": "cldoc...",
        "branchId": "clbranch...",
        "startsAt": "2026-08-01T04:30:00.000Z",
        "endsAt": "2026-08-01T04:45:00.000Z",
        "status": "AVAILABLE",
        "bufferAfterMinutes": 5
      }
    ]
  }
}
```

**Errors:** `400`, `401`.

---

#### `GET /api/v1/availability/earliest`

| | |
| --- | --- |
| **Purpose** | Earliest available slot across one or all branches |
| **Auth** | Internal API Key or Admin JWT |

**Query**

```json
{
  "clinicId": "clclinic...",
  "branchIds": ["clbranch_a", "clbranch_b"],
  "doctorId": "cldoc...",
  "departmentId": "cldept...",
  "from": "2026-08-01T00:00:00.000Z",
  "to": "2026-08-14T23:59:59.000Z"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "found": true,
    "slot": {
      "id": "clslot...",
      "branchId": "clbranch_a",
      "doctorId": "cldoc...",
      "startsAt": "2026-08-01T04:30:00.000Z",
      "endsAt": "2026-08-01T04:45:00.000Z"
    }
  }
}
```

**Errors:** `400`, `401`. Soft miss: `found: false`.

---

#### `POST /api/v1/availability/slots/:slotId/hold`

| | |
| --- | --- |
| **Purpose** | Temporary hold during voice conversation (`slotHoldMinutes`) |
| **Auth** | Internal API Key |

**Request**

```json
{
  "callSessionId": "clcall...",
  "idempotencyKey": "hold_..."
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "slotId": "clslot...",
    "status": "HELD",
    "holdExpiresAt": "2026-07-31T12:03:00.000Z"
  }
}
```

**Errors:** `404`, `409 SLOT_UNAVAILABLE`, `409 IDEMPOTENCY_CONFLICT`.

---

#### `POST /api/v1/availability/slots/:slotId/release`

| | |
| --- | --- |
| **Purpose** | Release an expired or abandoned hold |
| **Auth** | Internal API Key |

**Request**

```json
{
  "callSessionId": "clcall...",
  "idempotencyKey": "release_..."
}
```

**Errors:** `404`, `409 CONFLICT`.

---

### 1.7 Call Sessions

#### `POST /api/v1/call-sessions`

| | |
| --- | --- |
| **Purpose** | Create / upsert call session when Retell call starts |
| **Auth** | Internal API Key or Webhook Signature |

**Request**

```json
{
  "externalCallId": "retell_call_...",
  "direction": "INBOUND",
  "branchId": "clbranch...",
  "fromNumber": "+9198...",
  "toNumber": "+9122...",
  "language": "hi",
  "promptVersion": "v3.2",
  "modelVersion": "gpt-4.1-mini"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "callSession": {
      "id": "clcall...",
      "status": "IN_PROGRESS",
      "recoveryToken": "rcv_..."
    }
  }
}
```

**Errors:** `400`, `401`, `409` (duplicate externalCallId — return existing).

---

#### `PATCH /api/v1/call-sessions/:callSessionId`

| | |
| --- | --- |
| **Purpose** | Persist lightweight conversation state / transcript increments |
| **Auth** | Internal API Key |

**Request**

```json
{
  "patientId": "clpatient...",
  "currentIntent": "book_appointment",
  "currentStep": "confirm_slot",
  "conversationState": {
    "selectedDoctorId": "cldoc...",
    "heldSlotId": "clslot..."
  },
  "transcriptAppend": [
    { "role": "user", "text": "Book me tomorrow morning", "at": "2026-07-31T12:00:10.000Z" }
  ],
  "promptVersion": "v3.2",
  "modelVersion": "gpt-4.1-mini"
}
```

**Response `200`:** updated call session summary.  

**Errors:** `400`, `401`, `404`.

---

#### `POST /api/v1/call-sessions/:callSessionId/drop`

| | |
| --- | --- |
| **Purpose** | Mark call as dropped; optionally enqueue callback |
| **Auth** | Internal API Key or Webhook Signature |

**Request**

```json
{
  "createCallback": true,
  "reason": "DROPPED_CALL"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "callSession": { "id": "clcall...", "status": "DROPPED", "droppedAt": "..." },
    "callbackRequest": { "id": "clcb...", "status": "PENDING" }
  }
}
```

**Errors:** `401`, `404`, `409`.

---

#### `POST /api/v1/call-sessions/recover`

| | |
| --- | --- |
| **Purpose** | Resume dropped/in-progress conversation by token or phone |
| **Auth** | Internal API Key |

**Request**

```json
{
  "recoveryToken": "rcv_...",
  "phone": "+9198...",
  "externalCallId": "retell_new_call_..."
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "recovered": true,
    "callSession": {
      "id": "clcall...",
      "currentIntent": "book_appointment",
      "currentStep": "confirm_slot",
      "conversationState": {},
      "patientId": "clpatient...",
      "promptVersion": "v3.2",
      "modelVersion": "gpt-4.1-mini"
    }
  }
}
```

**Errors:** `400`, `401`, `404` / soft `recovered: false`.

---

#### `POST /api/v1/call-sessions/:callSessionId/complete`

| | |
| --- | --- |
| **Purpose** | Finalize successful call |
| **Auth** | Internal API Key or Webhook Signature |

**Request**

```json
{
  "summary": "Booked appointment for 1 Aug 10:00 IST",
  "status": "COMPLETED"
}
```

**Errors:** `401`, `404`, `409`.

---

### 1.8 Callbacks

#### `POST /api/v1/callbacks`

| | |
| --- | --- |
| **Purpose** | Create outbound callback request |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "phone": "+919876543210",
  "patientId": "clpatient...",
  "branchId": "clbranch...",
  "callSessionId": "clcall...",
  "reason": "DROPPED_CALL",
  "priority": 10,
  "notes": "Dropped during slot confirmation"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "callbackRequest": {
      "id": "clcb...",
      "status": "PENDING",
      "nextAttemptAt": "2026-07-31T12:15:00.000Z"
    }
  }
}
```

**Errors:** `400`, `401`.

---

#### `GET /api/v1/callbacks`

| | |
| --- | --- |
| **Purpose** | List callback queue for workers / ops |
| **Auth** | Internal API Key or Admin JWT |

**Query:** `status`, `branchId`, `dueBefore`, `limit`  

**Errors:** `400`, `401`.

---

#### `GET /api/v1/callbacks/:callbackId`

| | |
| --- | --- |
| **Purpose** | Callback detail |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

#### `POST /api/v1/callbacks/:callbackId/attempt`

| | |
| --- | --- |
| **Purpose** | Record outbound dial attempt start |
| **Auth** | Internal API Key |

**Request**

```json
{
  "externalCallId": "retell_outbound_..."
}
```

**Errors:** `401`, `404`, `409` (max attempts / not pending).

---

#### `POST /api/v1/callbacks/:callbackId/complete`

| | |
| --- | --- |
| **Purpose** | Mark callback completed or failed |
| **Auth** | Internal API Key |

**Request**

```json
{
  "outcome": "COMPLETED",
  "notes": "Patient rebooked"
}
```

`outcome`: `COMPLETED` | `FAILED` | `CANCELLED` | `EXPIRED`

**Errors:** `400`, `401`, `404`, `409`.

---

### 1.9 Cliniko

#### `POST /api/v1/cliniko/sync`

| | |
| --- | --- |
| **Purpose** | Enqueue or run sync for a local entity |
| **Auth** | Internal API Key or Admin JWT |

**Request**

```json
{
  "entityType": "APPOINTMENT",
  "localId": "clappt...",
  "direction": "OUTBOUND",
  "force": false
}
```

**Response `202`**

```json
{
  "success": true,
  "data": {
    "clinikoSync": {
      "id": "clsync...",
      "status": "PENDING",
      "entityType": "APPOINTMENT",
      "localId": "clappt..."
    }
  }
}
```

**Errors:** `400`, `401`, `404`, `409 CONFLICT`.

---

#### `GET /api/v1/cliniko/sync/:syncId`

| | |
| --- | --- |
| **Purpose** | Sync job status |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

#### `POST /api/v1/cliniko/webhooks`

| | |
| --- | --- |
| **Purpose** | Ingest Cliniko webhook events |
| **Auth** | Webhook Signature |

**Request:** provider payload (opaque; validated then mapped).  

**Response `202`:** `{ "success": true, "data": { "accepted": true } }`  

**Errors:** `401`, `400`, `422`.

---

#### `GET /api/v1/cliniko/entities/:entityType/:localId`

| | |
| --- | --- |
| **Purpose** | Lookup Cliniko mapping for a local row |
| **Auth** | Internal API Key or Admin JWT |

**Errors:** `401`, `404`.

---

### 1.10 Internal

#### `POST /api/v1/internal/jobs/release-expired-holds`

| | |
| --- | --- |
| **Purpose** | Worker: release expired slot holds |
| **Auth** | Internal API Key |

**Response `200`:** `{ "releasedCount": 12 }`  
**Errors:** `401`.

---

#### `POST /api/v1/internal/jobs/process-callbacks`

| | |
| --- | --- |
| **Purpose** | Worker: claim due callbacks and trigger outbound dials |
| **Auth** | Internal API Key |

**Response `200`:** `{ "claimed": 5 }`  
**Errors:** `401`.

---

#### `POST /api/v1/internal/jobs/cliniko-retry`

| | |
| --- | --- |
| **Purpose** | Worker: retry failed Cliniko sync rows |
| **Auth** | Internal API Key |

**Errors:** `401`.

---

#### `POST /api/v1/internal/audit`

| | |
| --- | --- |
| **Purpose** | Optional explicit audit write from trusted services |
| **Auth** | Internal API Key |

**Request**

```json
{
  "actorType": "VOICE_AI",
  "actorId": "clcall...",
  "action": "BOOK",
  "entityType": "Appointment",
  "entityId": "clappt...",
  "before": null,
  "after": {},
  "callSessionId": "clcall..."
}
```

**Errors:** `400`, `401`.

---

#### `GET /api/v1/internal/idempotency/:key`

| | |
| --- | --- |
| **Purpose** | Debug / replay inspection of idempotency records |
| **Auth** | Internal API Key |

**Errors:** `401`, `404`.

---

## 2. Retell Tool API Contract

Retell tools call **Internal** backend routes (or a dedicated `/api/v1/retell/tools/*` facade that delegates to the same services).  
Auth: `Internal API Key` + optional Retell signature.  
Every tool should pass `callSessionId` and an `idempotencyKey` for mutations.

Shared tool error shape:

```json
{
  "ok": false,
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "That time was just taken. Please choose another slot.",
    "retryable": true
  }
}
```

---

### 2.1 `searchAvailability`

**Purpose:** Find open slots for voice suggestions.

**Input JSON Schema**

```json
{
  "type": "object",
  "required": ["from", "to"],
  "properties": {
    "callSessionId": { "type": "string" },
    "branchId": { "type": "string" },
    "branchIds": { "type": "array", "items": { "type": "string" } },
    "doctorId": { "type": "string" },
    "departmentId": { "type": "string" },
    "from": { "type": "string", "format": "date-time" },
    "to": { "type": "string", "format": "date-time" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 },
    "earliestOnly": { "type": "boolean", "default": false }
  }
}
```

**Output JSON Schema**

```json
{
  "type": "object",
  "required": ["ok", "slots"],
  "properties": {
    "ok": { "type": "boolean" },
    "slots": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "slotId": { "type": "string" },
          "branchId": { "type": "string" },
          "branchName": { "type": "string" },
          "doctorId": { "type": "string" },
          "doctorName": { "type": "string" },
          "startsAtLocal": { "type": "string" },
          "endsAtLocal": { "type": "string" },
          "startsAt": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

**Validation:** `from < to`; window ≤ 31 days; at least one of branch/doctor/department preferred.  
**Errors:** `VALIDATION_ERROR`, `UNAUTHORIZED`, `INTERNAL_ERROR`.

---

### 2.2 `bookAppointment`

**Purpose:** Confirm booking for a held or available slot.

**Input**

```json
{
  "type": "object",
  "required": ["patientId", "slotId", "idempotencyKey"],
  "properties": {
    "callSessionId": { "type": "string" },
    "patientId": { "type": "string" },
    "slotId": { "type": "string" },
    "departmentId": { "type": "string" },
    "visitReason": { "type": "string", "maxLength": 500 },
    "idempotencyKey": { "type": "string", "minLength": 8 }
  }
}
```

**Output**

```json
{
  "type": "object",
  "required": ["ok", "appointment"],
  "properties": {
    "ok": { "type": "boolean" },
    "appointment": {
      "type": "object",
      "properties": {
        "appointmentId": { "type": "string" },
        "status": { "type": "string" },
        "doctorName": { "type": "string" },
        "branchName": { "type": "string" },
        "startsAtLocal": { "type": "string" },
        "endsAtLocal": { "type": "string" }
      }
    }
  }
}
```

**Validation:** patient exists; slot `AVAILABLE` or `HELD` by this session; hold not expired.  
**Errors:** `SLOT_UNAVAILABLE`, `NOT_FOUND`, `VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`, `POLICY_VIOLATION`.

---

### 2.3 `cancelAppointment`

**Purpose:** Cancel an existing appointment for the patient on the call.

**Input**

```json
{
  "type": "object",
  "required": ["appointmentId", "idempotencyKey"],
  "properties": {
    "callSessionId": { "type": "string" },
    "appointmentId": { "type": "string" },
    "patientId": { "type": "string" },
    "cancellationReason": { "type": "string" },
    "idempotencyKey": { "type": "string" }
  }
}
```

**Output**

```json
{
  "type": "object",
  "required": ["ok", "appointmentId", "status"],
  "properties": {
    "ok": { "type": "boolean" },
    "appointmentId": { "type": "string" },
    "status": { "const": "CANCELLED" },
    "message": { "type": "string" }
  }
}
```

**Validation:** appointment belongs to patient when `patientId` provided; status cancellable; within cancel window.  
**Errors:** `NOT_FOUND`, `POLICY_VIOLATION`, `CONFLICT`, `VALIDATION_ERROR`.

---

### 2.4 `rescheduleAppointment`

**Purpose:** Move appointment to a new slot.

**Input**

```json
{
  "type": "object",
  "required": ["appointmentId", "newSlotId", "idempotencyKey"],
  "properties": {
    "callSessionId": { "type": "string" },
    "appointmentId": { "type": "string" },
    "newSlotId": { "type": "string" },
    "visitReason": { "type": "string" },
    "idempotencyKey": { "type": "string" }
  }
}
```

**Output**

```json
{
  "type": "object",
  "required": ["ok", "appointment"],
  "properties": {
    "ok": { "type": "boolean" },
    "appointment": {
      "type": "object",
      "properties": {
        "appointmentId": { "type": "string" },
        "previousAppointmentId": { "type": "string" },
        "startsAtLocal": { "type": "string" },
        "branchName": { "type": "string" },
        "doctorName": { "type": "string" }
      }
    }
  }
}
```

**Validation:** old appointment active; new slot available/held; within reschedule window.  
**Errors:** `SLOT_UNAVAILABLE`, `POLICY_VIOLATION`, `NOT_FOUND`, `CONFLICT`.

---

### 2.5 `findPatient`

**Purpose:** Identify returning or new caller.

**Input**

```json
{
  "type": "object",
  "properties": {
    "callSessionId": { "type": "string" },
    "phone": { "type": "string" },
    "fullName": { "type": "string" },
    "dateOfBirth": { "type": "string", "format": "date" }
  },
  "anyOf": [
    { "required": ["phone"] },
    { "required": ["fullName", "dateOfBirth"] }
  ]
}
```

**Output**

```json
{
  "type": "object",
  "required": ["ok", "found"],
  "properties": {
    "ok": { "type": "boolean" },
    "found": { "type": "boolean" },
    "patient": {
      "type": "object",
      "properties": {
        "patientId": { "type": "string" },
        "fullName": { "type": "string" },
        "isReturning": { "type": "boolean" },
        "preferredLanguage": { "type": "string" }
      }
    },
    "matchConfidence": { "enum": ["high", "medium", "low"] }
  }
}
```

**Validation:** phone normalized to E.164 when present.  
**Errors:** `VALIDATION_ERROR` only; prefer `found: false` over hard 404.

---

### 2.6 `registerPatient`

**Purpose:** Create patient when not found.

**Input**

```json
{
  "type": "object",
  "required": ["firstName", "lastName", "fullName", "phone", "idempotencyKey"],
  "properties": {
    "callSessionId": { "type": "string" },
    "firstName": { "type": "string" },
    "lastName": { "type": "string" },
    "fullName": { "type": "string" },
    "phone": { "type": "string" },
    "dateOfBirth": { "type": "string", "format": "date" },
    "gender": { "enum": ["MALE", "FEMALE", "OTHER", "UNKNOWN"] },
    "preferredLanguage": { "type": "string" },
    "idempotencyKey": { "type": "string" }
  }
}
```

**Output:** `{ "ok": true, "patientId": "...", "fullName": "..." }`  
**Errors:** `CONFLICT` (duplicate phone), `VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`.

---

### 2.7 `holdSlot`

**Purpose:** Soft-lock a slot while confirming details.

**Input:** `{ callSessionId, slotId, idempotencyKey }`  
**Output:** `{ ok, slotId, holdExpiresAt }`  
**Validation:** slot available; session in progress.  
**Errors:** `SLOT_UNAVAILABLE`, `NOT_FOUND`.

---

### 2.8 `releaseSlot`

**Purpose:** Free a hold if user changes mind.

**Input:** `{ callSessionId, slotId, idempotencyKey }`  
**Output:** `{ ok, slotId, status: "AVAILABLE" }`  
**Errors:** `NOT_FOUND`, `CONFLICT`.

---

### 2.9 `resumeCall`

**Purpose:** Recover dropped conversation state for a returning/redialed caller.

**Input**

```json
{
  "type": "object",
  "properties": {
    "recoveryToken": { "type": "string" },
    "phone": { "type": "string" },
    "externalCallId": { "type": "string" }
  },
  "anyOf": [{ "required": ["recoveryToken"] }, { "required": ["phone"] }]
}
```

**Output**

```json
{
  "type": "object",
  "required": ["ok", "recovered"],
  "properties": {
    "ok": { "type": "boolean" },
    "recovered": { "type": "boolean" },
    "callSessionId": { "type": "string" },
    "currentIntent": { "type": "string" },
    "currentStep": { "type": "string" },
    "conversationState": { "type": "object" },
    "patientId": { "type": "string" },
    "promptVersion": { "type": "string" },
    "modelVersion": { "type": "string" }
  }
}
```

**Errors:** soft miss preferred; `VALIDATION_ERROR`.

---

### 2.10 `saveConversation`

**Purpose:** Persist intent/step/state/transcript during the call.

**Input**

```json
{
  "type": "object",
  "required": ["callSessionId"],
  "properties": {
    "callSessionId": { "type": "string" },
    "currentIntent": { "type": "string" },
    "currentStep": { "type": "string" },
    "conversationState": { "type": "object" },
    "transcriptAppend": { "type": "array" },
    "promptVersion": { "type": "string" },
    "modelVersion": { "type": "string" },
    "patientId": { "type": "string" }
  }
}
```

**Output:** `{ "ok": true, "savedAt": "..." }`  
**Errors:** `NOT_FOUND`, `VALIDATION_ERROR`.

---

### 2.11 `createCallback`

**Purpose:** Queue missed/dropped outbound callback.

**Input**

```json
{
  "type": "object",
  "required": ["phone"],
  "properties": {
    "callSessionId": { "type": "string" },
    "patientId": { "type": "string" },
    "branchId": { "type": "string" },
    "phone": { "type": "string" },
    "reason": {
      "enum": ["DROPPED_CALL", "MISSED_OUTBOUND", "PATIENT_REQUESTED", "FOLLOW_UP", "OTHER"]
    },
    "notes": { "type": "string" },
    "priority": { "type": "integer" }
  }
}
```

**Output:** `{ "ok": true, "callbackId": "...", "status": "PENDING" }`  
**Errors:** `VALIDATION_ERROR`.

---

### 2.12 `listPatientAppointments`

**Purpose:** Help cancel/reschedule by reading upcoming bookings.

**Input:** `{ callSessionId, patientId, limit? }`  
**Output:** `{ ok, appointments: [{ appointmentId, startsAtLocal, doctorName, branchName, status }] }`  
**Errors:** `NOT_FOUND`, `VALIDATION_ERROR`.

---

### 2.13 `syncCliniko`

**Purpose:** Trigger sync after successful local mutation (optional explicit tool; usually automatic from services).

**Input:** `{ entityType, localId, direction? }`  
**Output:** `{ ok, syncId, status }`  
**Errors:** `NOT_FOUND`, `UPSTREAM_ERROR` (non-blocking preferred in voice path).

**Voice guidance:** prefer fire-and-forget via service after book/cancel/reschedule; expose tool only for admin/debug agents.

---

### 2.14 `markCallDropped`

**Purpose:** Explicit drop signal from Retell webhook/tool.

**Input:** `{ callSessionId, createCallback?: boolean }`  
**Output:** `{ ok, status: "DROPPED", callbackId? }`  
**Errors:** `NOT_FOUND`, `CONFLICT`.

---

## 3. Service Layer Architecture

Services own **use cases**. Controllers/tools only validate transport and call services. Services never talk to Express `req`/`res`. Cross-cutting: idempotency, audit, Cliniko enqueue.

| Service | Responsibilities | Collaborators |
| ------- | ---------------- | ------------- |
| **AppointmentService** | Book, cancel, reschedule; enforce clinic policy windows; orchestrate slot claim/release; write idempotency + audit; enqueue Cliniko sync | AvailabilityService, PatientService, CallSessionService, ClinikoService, AuditService, AppointmentRepository, AvailabilityRepository |
| **AvailabilityService** | Search slots, earliest across branches, hold/release, expire holds using `ClinicSettings.slotHoldMinutes` / slot `bufferAfterMinutes` | AvailabilityRepository, BranchService, DoctorService |
| **PatientService** | Lookup (phone/name), register, mark returning, normalize E.164 | PatientRepository, AuditService |
| **DoctorService** | List/filter doctors by branch/department; schedule read models | DoctorRepository, BranchService |
| **BranchService** | Branch listing, departments, clinic settings resolution | BranchRepository (or Branch + Clinic via Doctor/Branch repos), Clinic settings access |
| **CallSessionService** | Create/upsert session, save conversation, drop, complete, recover by token/phone | CallSessionRepository, CallbackService, AuditService |
| **CallbackService** | Create queue items, claim due work, record attempts, complete/fail with maxAttempts | CallbackRepository, CallSessionService, RetellService |
| **ClinikoService** | Map entities, enqueue sync, process outbound/inbound, conflict handling, webhook ingest | ClinikoRepository, Appointment/Patient/Doctor repos, AuditService |
| **RetellService** | Tool facade adapters, webhook verification, outbound dial initiation for callbacks, map provider call ids | CallSessionService, CallbackService |
| **AuditService** | Append-only audit writes for BOOK/CANCEL/RESCHEDULE/HOLD/RELEASE/RECOVER_SESSION/SYNC | Audit repository (or direct AuditLog access isolated here) |

**Service rules**

1. Mutations that book/reschedule/cancel **must** be idempotent via `IdempotencyRecord` + appointment `idempotencyKey`.
2. Booking path: validate patient → hold/claim slot → create appointment (`slotId` unique) → audit → async Cliniko.
3. Cancellation path: policy check → status CANCELLED → free slot → audit → async Cliniko.
4. Reschedule path: treat as cancel old + book new in one transaction conceptually (`rescheduledFromId` set).
5. Voice tools should receive **localized display times** from services (branch timezone), not raw UTC only.
6. Soft deletes: services filter `deletedAt IS NULL` on Patient/Doctor/Appointment/Branch.

---

## 4. Repository Layer Architecture

Repositories own **persistence only**: queries, uniqueness handling, transactions boundaries requested by services. No HTTP, no Cliniko HTTP, no Retell HTTP.

| Repository | Owns | Key operations (contract-level) |
| ---------- | ---- | -------------------------------- |
| **AppointmentRepository** | `Appointment` | create, findById, findByPatient, updateStatus, linkReschedule, findByIdempotencyKey |
| **PatientRepository** | `Patient` | create, findById, findByPhoneE164, searchByNameDob, softDelete |
| **DoctorRepository** | `Doctor`, `DoctorBranch`, `DoctorDepartment`, schedules/exceptions | findActive, findByBranchDepartment, getSchedule |
| **AvailabilityRepository** | `AppointmentSlot` | searchAvailable, findEarliest, findByIdForUpdate, hold, release, markBooked, releaseExpiredHolds |
| **CallbackRepository** | `CallbackRequest` | create, listDue, claim, updateAttempt, complete |
| **CallSessionRepository** | `CallSession` | upsertByExternalId, updateState, markDropped, findByRecoveryToken, findLatestDroppedByPhone |
| **ClinikoRepository** | `ClinikoSync` | upsertMapping, findByLocal, findByClinikoId, markStatus, listRetryable |

**Supporting persistence (not separate public repos required for v1, but owned by services)**

- Idempotency records → used by AppointmentService / shared Idempotency helper
- Audit logs → AuditService
- Clinic / ClinicSettings → BranchService (read settings for policy)

**Concurrency note:** AvailabilityRepository slot claim should use row-level locking or atomic conditional update (`AVAILABLE|HELD → BOOKED`) so double booking cannot occur even under parallel Retell retries.

---

## 5. Request Flows

### 5.1 Global path

```text
Patient Calls
    ↓
Retell (LLM + Tools)
    ↓
Backend API  (/api/v1/... or /api/v1/retell/tools/...)
    ↓
Service Layer
    ↓
Repository Layer
    ↓
Prisma
    ↓
PostgreSQL
    ↓
ClinikoService (async outbound sync)
    ↓
Cliniko
```

---

### 5.2 Booking flow

```text
Patient: "Book me with Dr. Mehta tomorrow morning"
    ↓
Retell → saveConversation(intent=book_appointment)
    ↓
Retell → findPatient(phone)
    ↓ (if not found)
Retell → registerPatient(...)
    ↓
Retell → searchAvailability(...) / earliestOnly
    ↓
Retell → holdSlot(slotId, callSessionId)
    ↓
Patient confirms
    ↓
Retell → bookAppointment(patientId, slotId, idempotencyKey, visitReason)
    ↓
AppointmentService
  1. Idempotency check
  2. Load ClinicSettings (buffers/windows)
  3. AvailabilityService.claimSlot (atomic)
  4. AppointmentRepository.create (unique slotId)
  5. AuditService.log(BOOK)
  6. ClinikoService.enqueue(APPOINTMENT, OUTBOUND)
    ↓
Response to Retell → spoken confirmation
    ↓
Retell → saveConversation(step=completed) + complete call session
```

---

### 5.3 Cancellation flow

```text
Patient: "Cancel my appointment"
    ↓
Retell → findPatient / resume prior context
    ↓
Retell → listPatientAppointments(patientId)
    ↓
Patient confirms which appointment
    ↓
Retell → cancelAppointment(appointmentId, reason, idempotencyKey)
    ↓
AppointmentService
  1. Idempotency check
  2. Policy: cancellationWindowHours
  3. Mark appointment CANCELLED + cancelledAt
  4. AvailabilityService.releaseBookedSlot → AVAILABLE
  5. AuditService.log(CANCEL)
  6. ClinikoService.enqueue cancel sync
    ↓
Spoken confirmation to patient
```

---

### 5.4 Rescheduling flow

```text
Patient: "Move my visit to Friday"
    ↓
Retell → listPatientAppointments
    ↓
Retell → searchAvailability (new window)
    ↓
Retell → holdSlot(newSlotId)
    ↓
Retell → rescheduleAppointment(appointmentId, newSlotId, idempotencyKey)
    ↓
AppointmentService (single unit of work)
  1. Idempotency check
  2. Policy: rescheduleWindowHours
  3. Cancel/close old appointment (status CANCELLED, keep history)
  4. Release old slot
  5. Claim new slot
  6. Create new appointment with rescheduledFromId
  7. AuditService.log(RESCHEDULE)
  8. ClinikoService.enqueue old+new
    ↓
Spoken confirmation with new local time + branch
```

---

### 5.5 Dropped call recovery flow

```text
Call drops mid-booking (slot may be HELD)
    ↓
Retell webhook / markCallDropped(callSessionId, createCallback=true)
    ↓
CallSessionService.drop
  - status=DROPPED, droppedAt=now
  - preserve currentIntent, currentStep, conversationState, recoveryToken
  - CallbackService.create(reason=DROPPED_CALL)
    ↓
Internal worker → process-callbacks → RetellService.outboundDial
    ↓
Patient answers / redials
    ↓
Retell → resumeCall(recoveryToken | phone)
    ↓
CallSessionService.recover
  - return intent/step/state/promptVersion/modelVersion
  - re-associate new externalCallId
    ↓
If held slot still valid → continue confirm
If hold expired → searchAvailability again → hold → book
    ↓
Normal booking completion
```

---

## 6. Cross-Cutting Design Notes

1. **Idempotency:** Required on book/cancel/reschedule/hold/register. Store request hash + response in `IdempotencyRecord`.
2. **Double booking:** Enforced by DB (`Appointment.slotId` unique + `AppointmentSlot(doctorId, startsAt)` unique) and atomic slot status transitions in AvailabilityRepository.
3. **Policy:** Read from `ClinicSettings` (not hardcoded): hold minutes, cancel/reschedule windows, buffers.
4. **Soft delete:** Public APIs ignore `deletedAt` set rows for Patient/Doctor/Appointment/Branch.
5. **Cliniko:** Sync is asynchronous after successful local commit; voice path must not block on Cliniko latency.
6. **Audit:** Every appointment mutation and session recover/drop writes `AuditLog`.
7. **Auth:** Retell tools and workers use Internal API Key; Cliniko/Retell ingress verify signatures; admin console uses JWT later.
8. **Versioning:** `/api/v1` only for now; tool schemas versioned independently via `promptVersion` on CallSession.

---

## 7. Implementation Boundary Reminder

This document defines **contracts and architecture only**.

Do **not** treat this as permission to:

- alter `schema.prisma`
- generate controllers / Prisma queries / service code in this step

Next implementation phase should follow: validators → repositories → services → routes → Retell tool facade → workers.
