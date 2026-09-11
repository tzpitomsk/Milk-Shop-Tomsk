import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_RETURN_BATCH_ID = 1;

type Candidate = {
  batchId: number;
  orderBatchId: number;
  sold: number;
  alreadyReturned: number;
  remainingCapacity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;
};

function line(char = "=", length = 78) {
  console.log(char.repeat(length));
}

function section(title: string) {
  console.log("\n");
  line();
  console.log(title);
  line();
  console.log("");
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "NULL";
  return date.toISOString();
}

async function main() {
  console.log("\n");
  line();
  console.log("RETURNBATCH #1 REPAIR PLAN");
  console.log("STRICT DRY-RUN / READ ONLY");
  line();

  console.log(`
Target ReturnBatch ID: #${TARGET_RETURN_BATCH_ID}

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

This script only prepares and validates a possible repair plan.
`);

  section("1. LOAD TARGET RETURNBATCH");

  const target = await prisma.returnBatch.findUnique({
    where: {
      id: TARGET_RETURN_BATCH_ID,
    },
    include: {
      OrderItem: {
        include: {
          order: true,
          product: true,
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

  if (!target) {
    console.log(
      `🔴 CRITICAL: ReturnBatch #${TARGET_RETURN_BATCH_ID} was not found.`,
    );
    return;
  }

  const orderItem = target.OrderItem;
  const order = orderItem.order;
  const product = orderItem.product;

  console.log(`ReturnBatch #${target.id}`);
  console.log(`quantity=${target.quantity}`);
  console.log(`createdAt=${formatDate(target.createdAt)}`);
  console.log(`orderItemId=${target.orderItemId}`);
  console.log(`current batchId=${target.batchId}`);

  console.log("\nCurrent linked Batch:");
  console.log(`Batch #${target.Batch.id}`);
  console.log(`Product #${target.Batch.productId}`);
  console.log(`Product="${target.Batch.product.name}"`);
  console.log(`quantity=${target.Batch.quantity}`);
  console.log(`purchaseCost=${target.Batch.purchaseCost}`);
  console.log(`receivedAt=${formatDate(target.Batch.receivedAt)}`);
  console.log(`expiryDate=${formatDate(target.Batch.expiryDate)}`);
  console.log(`status=${target.Batch.status}`);

  section("2. ORDERITEM AND ORDER CONTEXT");

  console.log(`OrderItem #${orderItem.id}`);
  console.log(`Order #${orderItem.orderId}`);
  console.log(`Product #${product.id}`);
  console.log(`Product="${product.name}"`);
  console.log(`quantity sold=${orderItem.quantity}`);
  console.log(`returned field=${orderItem.returned}`);
  console.log(`price=${orderItem.price}`);

  console.log("\nOrder:");
  console.log(`Order #${order.id}`);
  console.log(`date=${formatDate(order.date)}`);
  console.log(`total=${order.total}`);
  console.log(`profit=${order.profit}`);
  console.log(`status=${order.status}`);

  section("3. VERIFY CURRENT BATCH IS INVALID");

  const soldBatchIds = new Set(
    orderItem.batches.map((orderBatch) => orderBatch.batchId),
  );

  console.log(`Current ReturnBatch batch: #${target.batchId}`);

  if (soldBatchIds.has(target.batchId)) {
    console.log(
      `🟢 Current Batch #${target.batchId} exists among the sold OrderBatch records.`,
    );
  } else {
    console.log(
      `🔴 CONFIRMED: Current Batch #${target.batchId} was NOT sold through OrderItem #${orderItem.id}.`,
    );
  }

  section("4. LOAD ALL SOLD BATCHES");

  console.log(
    `OrderItem #${orderItem.id} has ${orderItem.batches.length} OrderBatch record(s):`,
  );

  if (orderItem.batches.length === 0) {
    console.log(
      "\n🔴 CRITICAL: No OrderBatch records exist. A repair plan cannot be created safely.",
    );
    return;
  }

  for (const orderBatch of orderItem.batches) {
    console.log(`\nOrderBatch #${orderBatch.id}`);
    console.log(`Batch #${orderBatch.batchId}`);
    console.log(`sold quantity=${orderBatch.quantity}`);
    console.log(`purchaseCost=${orderBatch.purchaseCost}`);
    console.log(`Product #${orderBatch.batch.productId}`);
    console.log(`Product="${orderBatch.batch.product.name}"`);
    console.log(`receivedAt=${formatDate(orderBatch.batch.receivedAt)}`);
    console.log(`expiryDate=${formatDate(orderBatch.batch.expiryDate)}`);
    console.log(`status=${orderBatch.batch.status}`);
  }

  section("5. LOAD ALL RETURNS FOR THIS ORDERITEM");

  console.log(
    `Found ${orderItem.ReturnBatch.length} ReturnBatch record(s):`,
  );

  for (const returnBatch of orderItem.ReturnBatch) {
    console.log(
      `\nReturnBatch #${returnBatch.id} | Batch #${returnBatch.batchId}`,
    );
    console.log(`quantity=${returnBatch.quantity}`);
    console.log(`createdAt=${formatDate(returnBatch.createdAt)}`);
    console.log(`Product="${returnBatch.Batch.product.name}"`);
    console.log(`Product #${returnBatch.Batch.productId}`);
  }

  const totalReturned = orderItem.ReturnBatch.reduce(
    (sum, returnBatch) => sum + returnBatch.quantity,
    0,
  );

  console.log("\nTotal ReturnBatch quantity=" + totalReturned);
  console.log("OrderItem.returned=" + orderItem.returned);
  console.log("OrderItem.quantity=" + orderItem.quantity);

  if (totalReturned === orderItem.returned) {
    console.log(
      "🟢 PASS: SUM(ReturnBatch.quantity) matches OrderItem.returned.",
    );
  } else {
    console.log(
      "🔴 CRITICAL: SUM(ReturnBatch.quantity) does not match OrderItem.returned.",
    );
    return;
  }

  if (totalReturned <= orderItem.quantity) {
    console.log(
      "🟢 PASS: Total returned quantity does not exceed sold quantity.",
    );
  } else {
    console.log(
      "🔴 CRITICAL: Total returned quantity exceeds sold quantity.",
    );
    return;
  }

  section("6. BUILD PER-BATCH RETURN CAPACITY");

  const candidates: Candidate[] = [];

  for (const orderBatch of orderItem.batches) {
    const batchId = orderBatch.batchId;

    const alreadyReturned = orderItem.ReturnBatch
      .filter(
        (returnBatch) =>
          returnBatch.batchId === batchId &&
          returnBatch.id !== target.id,
      )
      .reduce((sum, returnBatch) => sum + returnBatch.quantity, 0);

    const remainingCapacity = orderBatch.quantity - alreadyReturned;

    const candidate: Candidate = {
      batchId,
      orderBatchId: orderBatch.id,
      sold: orderBatch.quantity,
      alreadyReturned,
      remainingCapacity,
      purchaseCost: orderBatch.purchaseCost,
      receivedAt: orderBatch.batch.receivedAt,
      expiryDate: orderBatch.batch.expiryDate,
      status: orderBatch.batch.status,
    };

    candidates.push(candidate);

    console.log(`\nBatch #${candidate.batchId}`);
    console.log(`OrderBatch #${candidate.orderBatchId}`);
    console.log(`sold=${candidate.sold}`);
    console.log(`already returned excluding target=${candidate.alreadyReturned}`);
    console.log(`remaining return capacity=${candidate.remainingCapacity}`);

    if (candidate.remainingCapacity >= target.quantity) {
      console.log(
        `🟢 MATHEMATICALLY VALID for ReturnBatch #${target.id}.`,
      );
    } else {
      console.log(
        `🔴 NOT VALID: insufficient capacity for quantity=${target.quantity}.`,
      );
    }
  }

  section("7. PRODUCT CONSISTENCY CHECK");

  const invalidProductCandidates = orderItem.batches.filter(
    (orderBatch) =>
      orderBatch.batch.productId !== orderItem.productId,
  );

  if (invalidProductCandidates.length === 0) {
    console.log(
      "🟢 PASS: All OrderBatch candidates belong to the same product as OrderItem.",
    );
  } else {
    console.log(
      "🔴 CRITICAL: One or more OrderBatch records point to another product.",
    );

    for (const invalid of invalidProductCandidates) {
      console.log(
        `OrderBatch #${invalid.id} → Batch #${invalid.batchId} has Product #${invalid.batch.productId}, expected Product #${orderItem.productId}.`,
      );
    }

    return;
  }

  section("8. VALID REPAIR CANDIDATES");

  const validCandidates = candidates.filter(
    (candidate) => candidate.remainingCapacity >= target.quantity,
  );

  if (validCandidates.length === 0) {
    console.log(
      `🔴 CRITICAL: No sold batch has enough remaining capacity to receive ReturnBatch #${target.id}.`,
    );
    console.log(
      "\nAutomatic repair is NOT possible based on current database data.",
    );
    return;
  }

  console.log(
    `Found ${validCandidates.length} mathematically valid candidate(s):`,
  );

  for (const candidate of validCandidates) {
    console.log(`\nCandidate Batch #${candidate.batchId}`);
    console.log(`OrderBatch #${candidate.orderBatchId}`);
    console.log(`sold=${candidate.sold}`);
    console.log(`already returned=${candidate.alreadyReturned}`);
    console.log(`remaining capacity=${candidate.remainingCapacity}`);
    console.log(`purchaseCost=${candidate.purchaseCost}`);
    console.log(`receivedAt=${formatDate(candidate.receivedAt)}`);
    console.log(`expiryDate=${formatDate(candidate.expiryDate)}`);
    console.log(`status=${candidate.status}`);
  }

  section("9. FIFO ORDER OF VALID CANDIDATES");

  const fifoCandidates = [...validCandidates].sort((a, b) => {
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

  console.log("Project FIFO order:");
  console.log("1. expiryDate ASC");
  console.log("2. receivedAt ASC");
  console.log("3. batch ID ASC");

  fifoCandidates.forEach((candidate, index) => {
    console.log(
      `\n${index + 1}. Batch #${candidate.batchId}`,
    );
    console.log(`   sold=${candidate.sold}`);
    console.log(`   already returned=${candidate.alreadyReturned}`);
    console.log(`   remaining capacity=${candidate.remainingCapacity}`);
    console.log(`   expiry=${formatDate(candidate.expiryDate)}`);
    console.log(`   received=${formatDate(candidate.receivedAt)}`);
  });

  section("10. EXPLICIT REPAIR OPTIONS");

  console.log(
    `Current invalid relation:\nReturnBatch #${target.id} → Batch #${target.batchId}`,
  );

  console.log(
    "\nThe following options are structurally valid according to OrderBatch capacity:",
  );

  for (const candidate of validCandidates) {
    console.log("\n------------------------------------------------------------");
    console.log(`OPTION: Reassign ReturnBatch #${target.id}`);
    console.log(`FROM Batch #${target.batchId}`);
    console.log(`TO   Batch #${candidate.batchId}`);
    console.log(`Quantity: ${target.quantity}`);
    console.log("");
    console.log("Safety checks:");
    console.log(
      `  ${candidate.remainingCapacity >= target.quantity ? "🟢" : "🔴"} Capacity sufficient`,
    );
    console.log(
      `  🟢 Batch belongs to OrderItem product #${orderItem.productId}`,
    );
    console.log(
      `  🟢 Batch exists in OrderBatch records for OrderItem #${orderItem.id}`,
    );
    console.log("------------------------------------------------------------");
  }

  section("11. RECOMMENDED PLAN STATUS");

  if (validCandidates.length === 1) {
    const candidate = validCandidates[0];

    console.log(
      `🟢 STRUCTURALLY UNIQUE CANDIDATE FOUND: Batch #${candidate.batchId}`,
    );

    console.log(`
A future repair script may propose exactly:

ReturnBatch #${target.id}.batchId:
${target.batchId} → ${candidate.batchId}

However, this script still does NOT modify the database.
`);
  } else {
    console.log(
      `🟠 MULTIPLE VALID CANDIDATES FOUND: ${validCandidates.length}`,
    );

    console.log(
      "\nCandidates:",
    );

    for (const candidate of fifoCandidates) {
      console.log(
        `Batch #${candidate.batchId} | remaining capacity=${candidate.remainingCapacity}`,
      );
    }

    console.log(`
🔴 NO AUTOMATIC DATABASE REPAIR IS AUTHORIZED.

The database provides multiple structurally possible targets.

FIFO ranking is shown for analysis only.

FIFO order is NOT treated by this script as proof that the physical
returned item came from the first FIFO candidate.

A future repair script must explicitly specify the chosen batch ID.
`);
  }

  section("12. PROPOSED REPAIR CONTRACT");

  console.log(`
If a repair is later approved, the repair must satisfy ALL conditions:

1. Target ReturnBatch ID remains #${target.id}.
2. Target OrderItem remains #${orderItem.id}.
3. Target ReturnBatch quantity remains ${target.quantity}.
4. Current invalid batch is verified as #${target.batchId}.
5. Replacement batch must exist in OrderItem OrderBatch records.
6. Replacement batch product must equal Product #${orderItem.productId}.
7. Per-batch returned quantity must not exceed sold quantity.
8. OrderItem.returned must NOT be changed.
9. OrderItem.quantity must NOT be changed.
10. OrderBatch.quantity must NOT be changed.
11. Batch.quantity must NOT be changed.
12. Product.stock must NOT be changed.
13. No Movement records must be created or modified.
14. The repair transaction may modify ONLY:
    ReturnBatch #${target.id}.batchId
`);

  section("FINAL DRY-RUN STATUS");

  console.log("NO DATABASE CHANGES WERE MADE.");
  console.log("NO ReturnBatch UPDATED.");
  console.log("NO ReturnBatch DELETED.");
  console.log("NO OrderBatch UPDATED.");
  console.log("NO OrderItem UPDATED.");
  console.log("NO Batch UPDATED.");
  console.log("NO Product UPDATED.");
  console.log("NO Movement CREATED.");
  console.log("NO Movement UPDATED.");
  console.log("NO Movement DELETED.");

  if (validCandidates.length === 1) {
    console.log(
      "\n🟢 A structurally unique repair candidate exists.",
    );
  } else {
    console.log(
      "\n🟠 Multiple structurally valid repair candidates exist.",
    );
    console.log(
      "🔴 This script does NOT authorize automatic selection.",
    );
  }

  console.log(
    "\n🏁 RETURNBATCH #1 REPAIR PLAN DRY-RUN COMPLETED",
  );
}

main()
  .catch((error) => {
    console.error("\n🔴 SCRIPT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });