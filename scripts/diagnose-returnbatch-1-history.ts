import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_RETURN_BATCH_ID = 1;

function line(char = "=", length = 78) {
  console.log(char.repeat(length));
}

function title(text: string) {
  console.log("\n");
  line();
  console.log(text);
  line();
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "null";
  return date.toISOString();
}

function safeText(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  return String(value);
}

async function main() {
  console.log("\n");
  line();
  console.log("RETURNBATCH #1 HISTORICAL DIAGNOSTIC");
  console.log("STRICT DRY-RUN / READ ONLY");
  line();

  console.log("\nTarget ReturnBatch ID: #" + TARGET_RETURN_BATCH_ID);

  console.log(`
IMPORTANT:

This script performs NO database modifications.

NO ReturnBatch is updated.
NO ReturnBatch is deleted.
NO OrderBatch is updated.
NO OrderItem is updated.
NO Batch is updated.
NO Product is updated.
NO Movement is created.
NO Movement is updated.
NO Movement is deleted.

This script only investigates historical evidence.
`);

  // ===========================================================================
  // 1. LOAD TARGET RETURNBATCH
  // ===========================================================================

  title("1. LOAD TARGET RETURNBATCH");

  const returnBatch = await prisma.returnBatch.findUnique({
    where: {
      id: TARGET_RETURN_BATCH_ID,
    },
    include: {
      OrderItem: {
        include: {
          product: true,
          order: true,
          batches: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
            orderBy: {
              id: "asc",
            },
          },
          ReturnBatch: {
            include: {
              Batch: {
                include: {
                  product: true,
                },
              },
            },
            orderBy: {
              id: "asc",
            },
          },
        },
      },
      Batch: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!returnBatch) {
    console.log(
      `🔴 ERROR: ReturnBatch #${TARGET_RETURN_BATCH_ID} was not found.`
    );
    return;
  }

  const orderItem = returnBatch.OrderItem;
  const order = orderItem.order;
  const returnedBatch = returnBatch.Batch;
  const product = orderItem.product;

  console.log(`
ReturnBatch #${returnBatch.id}

quantity=${returnBatch.quantity}

createdAt=${formatDate(returnBatch.createdAt)}

orderItemId=${returnBatch.orderItemId}

batchId=${returnBatch.batchId}
`);

  // ===========================================================================
  // 2. BASIC HISTORICAL CONTEXT
  // ===========================================================================

  title("2. BASIC HISTORICAL CONTEXT");

  console.log(`
OrderItem #${orderItem.id}

Order #${order.id}

Product #${product.id}

Product="${product.name}"

quantity sold=${orderItem.quantity}

returned field=${orderItem.returned}

price=${orderItem.price}
`);

  console.log(`
Order #${order.id}

date=${formatDate(order.date)}

total=${order.total}

profit=${order.profit}

status=${order.status}
`);

  console.log(`
Target ReturnBatch event:

ReturnBatch #${returnBatch.id}

createdAt=${formatDate(returnBatch.createdAt)}

quantity=${returnBatch.quantity}

Target Batch #${returnedBatch.id}

receivedAt=${formatDate(returnedBatch.receivedAt)}

expiryDate=${formatDate(returnedBatch.expiryDate)}

status=${returnedBatch.status}

current quantity=${returnedBatch.quantity}

purchaseCost=${returnedBatch.purchaseCost}
`);

  // ===========================================================================
  // 3. TIME RELATIONSHIP
  // ===========================================================================

  title("3. TIME RELATIONSHIP");

  const orderTime = order.date.getTime();
  const returnTime = returnBatch.createdAt.getTime();
  const returnedBatchReceivedTime = returnedBatch.receivedAt.getTime();

  const millisecondsBetweenOrderAndReturn = returnTime - orderTime;

  console.log(`
Order date:
${formatDate(order.date)}

ReturnBatch createdAt:
${formatDate(returnBatch.createdAt)}

Returned Batch #${returnedBatch.id} receivedAt:
${formatDate(returnedBatch.receivedAt)}
`);

  if (millisecondsBetweenOrderAndReturn >= 0) {
    console.log(
      `🟢 PASS: Return occurred ${millisecondsBetweenOrderAndReturn} ms after the order.`
    );
  } else {
    console.log(
      `🔴 CRITICAL: Return timestamp is BEFORE the order timestamp by ${Math.abs(
        millisecondsBetweenOrderAndReturn
      )} ms.`
    );
  }

  if (returnedBatchReceivedTime <= returnTime) {
    console.log(
      `🟢 FACT: Batch #${returnedBatch.id} already existed when the return was created.`
    );
  } else {
    console.log(
      `🔴 CRITICAL: Batch #${returnedBatch.id} did not exist yet at return time.`
    );
  }

  // ===========================================================================
  // 4. ACTUALLY SOLD BATCHES
  // ===========================================================================

  title("4. ACTUALLY SOLD BATCHES");

  if (orderItem.batches.length === 0) {
    console.log("🔴 CRITICAL: OrderItem has no OrderBatch records.");
  } else {
    console.log(
      `OrderItem #${orderItem.id} has ${orderItem.batches.length} OrderBatch record(s):`
    );

    for (const orderBatch of orderItem.batches) {
      console.log(`
OrderBatch #${orderBatch.id}

Batch #${orderBatch.batch.id}

sold quantity=${orderBatch.quantity}

purchaseCost=${orderBatch.purchaseCost}

Batch receivedAt=${formatDate(orderBatch.batch.receivedAt)}

Batch expiryDate=${formatDate(orderBatch.batch.expiryDate)}

Batch status=${orderBatch.batch.status}

Batch current quantity=${orderBatch.batch.quantity}

Product #${orderBatch.batch.productId}

Product="${orderBatch.batch.product.name}"
`);
    }
  }

  // ===========================================================================
  // 5. HISTORICAL AVAILABILITY OF SOLD BATCHES
  // ===========================================================================

  title("5. HISTORICAL AVAILABILITY OF SOLD BATCHES");

  console.log(`
This section does NOT reconstruct exact historical Batch.quantity.

It checks only whether each sold batch existed before:

1. the order;
2. the return.

Historical stock levels cannot be reconstructed safely from
current Batch.quantity alone.
`);

  for (const orderBatch of orderItem.batches) {
    const batch = orderBatch.batch;

    console.log(`
Batch #${batch.id}

receivedAt=${formatDate(batch.receivedAt)}

Order date=${formatDate(order.date)}

Return date=${formatDate(returnBatch.createdAt)}
`);

    if (batch.receivedAt.getTime() <= orderTime) {
      console.log("🟢 PASS: Batch existed when the order was created.");
    } else {
      console.log(
        "🔴 CRITICAL: Batch was received AFTER the order was created."
      );
    }

    if (batch.receivedAt.getTime() <= returnTime) {
      console.log("🟢 PASS: Batch existed when the return was created.");
    } else {
      console.log(
        "🔴 CRITICAL: Batch was received AFTER the return was created."
      );
    }

    if (batch.expiryDate.getTime() < orderTime) {
      console.log(
        "🟠 WARNING: Batch expiry date was before the order timestamp."
      );
    } else {
      console.log(
        "🟢 FACT: Batch expiry date was not before the order timestamp."
      );
    }

    if (batch.expiryDate.getTime() < returnTime) {
      console.log(
        "🟠 WARNING: Batch expiry date was before the return timestamp."
      );
    } else {
      console.log(
        "🟢 FACT: Batch expiry date was not before the return timestamp."
      );
    }
  }

  // ===========================================================================
  // 6. RETURN ALLOCATION CAPACITY
  // ===========================================================================

  title("6. RETURN ALLOCATION CAPACITY");

  const returnByBatchId = new Map<number, number>();

  for (const rb of orderItem.ReturnBatch) {
    const previous = returnByBatchId.get(rb.batchId) ?? 0;
    returnByBatchId.set(rb.batchId, previous + rb.quantity);
  }

  console.log(
    `Total ReturnBatch records for OrderItem #${orderItem.id}: ${orderItem.ReturnBatch.length}`
  );

  console.log("");

  for (const orderBatch of orderItem.batches) {
    const returnedForBatch = returnByBatchId.get(orderBatch.batchId) ?? 0;
    const available = orderBatch.quantity - returnedForBatch;

    console.log(`
Batch #${orderBatch.batchId}

sold=${orderBatch.quantity}

already returned=${returnedForBatch}

remaining return capacity=${available}
`);

    if (available >= returnBatch.quantity) {
      console.log(
        `🟢 This batch has enough mathematical capacity for ReturnBatch #${returnBatch.id}.`
      );
    } else if (available > 0) {
      console.log(
        `🟠 This batch has some remaining capacity, but not enough for the full target return quantity.`
      );
    } else {
      console.log(
        `🔴 This batch has no remaining return capacity.`
      );
    }
  }

  // ===========================================================================
  // 7. MOVEMENT HISTORY FOR PRODUCT
  // ===========================================================================

  title("7. PRODUCT MOVEMENT HISTORY AROUND ORDER AND RETURN");

  const windowStart = new Date(
    Math.min(orderTime, returnTime) - 24 * 60 * 60 * 1000
  );

  const windowEnd = new Date(
    Math.max(orderTime, returnTime) + 24 * 60 * 60 * 1000
  );

  console.log(`
Historical window:

FROM ${formatDate(windowStart)}

TO   ${formatDate(windowEnd)}

Product #${product.id} "${product.name}"
`);

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  if (movements.length === 0) {
    console.log(
      "🟠 No Movement records were found in the selected historical window."
    );
  } else {
    console.log(
      `Found ${movements.length} Movement record(s):\n`
    );

    let running = 0;

    for (const movement of movements) {
      running += movement.quantity;

      console.log(
        `${formatDate(movement.createdAt)} | Movement #${movement.id} | ${movement.type} | ${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | WINDOW RUNNING=${running}${movement.comment ? ` | ${movement.comment}` : ""}`
      );
    }
  }

  // ===========================================================================
  // 8. MOVEMENTS DIRECTLY RELATED TO THE ORDER
  // ===========================================================================

  title("8. MOVEMENTS POSSIBLY RELATED TO ORDER #" + order.id);

  const orderReference = `Order #${order.id}`;

  const relatedMovements = movements.filter((movement) => {
    return movement.comment?.includes(orderReference);
  });

  if (relatedMovements.length === 0) {
    console.log(`
No Movement records in the selected window contain:

"${orderReference}"

This does NOT prove that no movements belong to the order.

Movement.comment is historical text and may not be a reliable
foreign-key relationship.
`);
  } else {
    for (const movement of relatedMovements) {
      console.log(`
Movement #${movement.id}

createdAt=${formatDate(movement.createdAt)}

type=${movement.type}

quantity=${movement.quantity}

comment=${safeText(movement.comment)}
`);
    }
  }

  // ===========================================================================
  // 9. BATCH #22 CONTEXT
  // ===========================================================================

  title("9. WRONG TARGET BATCH #22 CONTEXT");

  console.log(`
ReturnBatch #${returnBatch.id} currently points to Batch #${returnedBatch.id}.

Batch #${returnedBatch.id} was received:

${formatDate(returnedBatch.receivedAt)}

The order was created:

${formatDate(order.date)}

The return was created:

${formatDate(returnBatch.createdAt)}
`);

  if (
    returnedBatch.receivedAt.getTime() <= orderTime &&
    returnedBatch.receivedAt.getTime() <= returnTime
  ) {
    console.log(`
🟢 FACT: Batch #${returnedBatch.id} existed both at order time and return time.

However, existence alone does NOT make the batch a valid return target.
`);
  }

  const soldBatchIds = new Set(
    orderItem.batches.map((orderBatch) => orderBatch.batchId)
  );

  if (!soldBatchIds.has(returnedBatch.id)) {
    console.log(`
🔴 CONFIRMED:

Batch #${returnedBatch.id} is NOT among the batches actually sold
through OrderBatch records for OrderItem #${orderItem.id}.

Therefore the current ReturnBatch allocation cannot be considered valid.
`);
  }

  // ===========================================================================
  // 10. CANDIDATE BATCH COMPARISON
  // ===========================================================================

  title("10. CANDIDATE BATCH COMPARISON");

  const candidates = orderItem.batches
    .map((orderBatch) => {
      const alreadyReturned =
        returnByBatchId.get(orderBatch.batchId) ?? 0;

      const capacity =
        orderBatch.quantity - alreadyReturned;

      return {
        orderBatchId: orderBatch.id,
        batchId: orderBatch.batchId,
        sold: orderBatch.quantity,
        alreadyReturned,
        capacity,
        receivedAt: orderBatch.batch.receivedAt,
        expiryDate: orderBatch.batch.expiryDate,
        status: orderBatch.batch.status,
      };
    })
    .filter((candidate) => candidate.capacity >= returnBatch.quantity);

  if (candidates.length === 0) {
    console.log(
      "🔴 CRITICAL: No sold batch has enough remaining capacity for this return."
    );
  } else {
    console.log(
      `Found ${candidates.length} mathematically possible candidate batch(es):`
    );

    for (const candidate of candidates) {
      console.log(`
Candidate Batch #${candidate.batchId}

OrderBatch #${candidate.orderBatchId}

sold=${candidate.sold}

already returned=${candidate.alreadyReturned}

remaining capacity=${candidate.capacity}

receivedAt=${formatDate(candidate.receivedAt)}

expiryDate=${formatDate(candidate.expiryDate)}

status=${candidate.status}
`);
    }
  }

  // ===========================================================================
  // 11. FIFO / CHRONOLOGY EVIDENCE
  // ===========================================================================

  title("11. FIFO / CHRONOLOGY EVIDENCE");

  const chronologicalCandidates = [...candidates].sort((a, b) => {
    const expiryCompare =
      a.expiryDate.getTime() - b.expiryDate.getTime();

    if (expiryCompare !== 0) {
      return expiryCompare;
    }

    const receivedCompare =
      a.receivedAt.getTime() - b.receivedAt.getTime();

    if (receivedCompare !== 0) {
      return receivedCompare;
    }

    return a.batchId - b.batchId;
  });

  console.log(`
Candidates sorted using the project's FIFO order:

1. expiryDate ASC
2. receivedAt ASC
3. batch ID ASC
`);

  for (let index = 0; index < chronologicalCandidates.length; index++) {
    const candidate = chronologicalCandidates[index];

    console.log(
      `${index + 1}. Batch #${candidate.batchId} | expiry=${formatDate(
        candidate.expiryDate
      )} | received=${formatDate(
        candidate.receivedAt
      )} | available=${candidate.capacity}`
    );
  }

  if (chronologicalCandidates.length === 1) {
    console.log(`
🟢 There is only one mathematically possible sold batch.

However, this diagnostic still does NOT modify the database.
`);
  }

  if (chronologicalCandidates.length > 1) {
    console.log(`
🟠 IMPORTANT:

Multiple sold batches can mathematically receive this return.

FIFO ordering can rank candidates, but FIFO ranking alone is NOT
historical proof that the returned item physically came from the
first candidate.

Therefore automatic repair is NOT authorized by this script.
`);
  }

  // ===========================================================================
  // 12. FINAL EVIDENCE SUMMARY
  // ===========================================================================

  title("12. FINAL EVIDENCE SUMMARY");

  const targetIsSoldBatch = soldBatchIds.has(returnedBatch.id);

  console.log(`
Target ReturnBatch #${returnBatch.id}

OrderItem #${orderItem.id}

Order #${order.id}

Product #${product.id} "${product.name}"

Return quantity=${returnBatch.quantity}

Current ReturnBatch Batch=#${returnedBatch.id}

Actually sold Batch IDs=${Array.from(soldBatchIds)
  .map((id) => `#${id}`)
  .join(", ") || "none"}

Current target batch valid=${targetIsSoldBatch ? "YES" : "NO"}

Mathematically possible replacement candidates=${candidates.length}
`);

  if (!targetIsSoldBatch) {
    console.log(`
🔴 CONFIRMED INTEGRITY FAILURE:

ReturnBatch #${returnBatch.id} points to Batch #${returnedBatch.id},

but OrderItem #${orderItem.id} was actually sold from:

${Array.from(soldBatchIds)
  .map((id) => `Batch #${id}`)
  .join(", ")}

The current batch link is historically inconsistent.
`);
  }

  if (candidates.length === 1) {
    console.log(`
🟠 ONE MATHEMATICAL CANDIDATE FOUND:

Batch #${candidates[0].batchId}

This is strong structural evidence, but this DRY-RUN script still
does NOT authorize or perform an automatic repair.
`);
  }

  if (candidates.length > 1) {
    console.log(`
🟠 MULTIPLE POSSIBLE CANDIDATES FOUND:

${candidates.map((candidate) => `Batch #${candidate.batchId}`).join(", ")}

The database currently does not provide enough direct evidence in this
diagnostic to automatically decide which physical batch was returned.

A separate repair plan must explicitly document the chosen rule.
`);
  }

  // ===========================================================================
  // FINAL STATUS
  // ===========================================================================

  title("FINAL DRY-RUN STATUS");

  console.log(`
NO DATABASE CHANGES WERE MADE.

NO ReturnBatch UPDATED.

NO ReturnBatch DELETED.

NO OrderBatch UPDATED.

NO OrderItem UPDATED.

NO Batch UPDATED.

NO Product UPDATED.

NO Movement CREATED.

NO Movement UPDATED.

NO Movement DELETED.

`);

  if (!targetIsSoldBatch) {
    console.log(
      "🔴 RETURNBATCH #1 INTEGRITY FAILURE REMAINS CONFIRMED."
    );
  }

  if (candidates.length === 0) {
    console.log(
      "🔴 NO SAFE REPLACEMENT BATCH CAN BE PROPOSED FROM CURRENT STRUCTURAL DATA."
    );
  } else if (candidates.length === 1) {
    console.log(
      "🟠 ONE STRUCTURALLY POSSIBLE REPLACEMENT EXISTS, BUT NO REPAIR WAS PERFORMED."
    );
  } else {
    console.log(
      "🟠 MULTIPLE STRUCTURALLY POSSIBLE REPLACEMENTS EXIST."
    );
  }

  console.log(`
🏁 RETURNBATCH #1 HISTORICAL DIAGNOSTIC COMPLETED
`);
}

main()
  .catch((error) => {
    console.error("\n🔴 DIAGNOSTIC ERROR:\n");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });