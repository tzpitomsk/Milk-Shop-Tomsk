import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_RETURN_BATCH_ID = 1;
const EXPECTED_ORDER_ITEM_ID = 61;
const EXPECTED_CURRENT_BATCH_ID = 22;
const REPLACEMENT_BATCH_ID = 16;

function line(char = "=", length = 78) {
  console.log(char.repeat(length));
}

function fail(message: string): never {
  console.error(`\n🔴 REPAIR ABORTED: ${message}\n`);
  throw new Error(message);
}

async function main() {
  line();
  console.log("RETURNBATCH #1 CONTROLLED REPAIR");
  console.log("EXPLICIT REPAIR PLAN");
  line();

  console.log(`
Target ReturnBatch ID: #${TARGET_RETURN_BATCH_ID}
Expected OrderItem ID: #${EXPECTED_ORDER_ITEM_ID}
Expected current Batch ID: #${EXPECTED_CURRENT_BATCH_ID}
Explicit replacement Batch ID: #${REPLACEMENT_BATCH_ID}

IMPORTANT:

This script is NOT a generic automatic repair.

The replacement Batch ID is explicitly fixed in the script.

The script must verify the complete repair contract before
making any database modification.

The repair may modify ONLY:

ReturnBatch #${TARGET_RETURN_BATCH_ID}.batchId

No other database records are authorized to change.
`);

  line();
  console.log("1. PRE-REPAIR DATABASE SNAPSHOT");
  line();

  const result = await prisma.$transaction(async (tx) => {
    /*
     * ============================================================
     * LOAD TARGET RETURNBATCH
     * ============================================================
     */

    const target = await tx.returnBatch.findUnique({
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
            },
            ReturnBatch: {
              include: {
                Batch: {
                  include: {
                    product: true,
                  },
                },
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
      fail(
        `ReturnBatch #${TARGET_RETURN_BATCH_ID} does not exist.`,
      );
    }

    console.log(`
ReturnBatch #${target.id}

quantity=${target.quantity}

orderItemId=${target.orderItemId}

current batchId=${target.batchId}

createdAt=${target.createdAt.toISOString()}
`);

    /*
     * ============================================================
     * HARD CONTRACT CHECK #1
     * ============================================================
     */

    if (target.orderItemId !== EXPECTED_ORDER_ITEM_ID) {
      fail(
        `Expected OrderItem #${EXPECTED_ORDER_ITEM_ID}, ` +
          `but ReturnBatch #${target.id} currently belongs to ` +
          `OrderItem #${target.orderItemId}.`,
      );
    }

    console.log(
      `🟢 PASS: ReturnBatch belongs to expected OrderItem #${EXPECTED_ORDER_ITEM_ID}`,
    );

    /*
     * ============================================================
     * HARD CONTRACT CHECK #2
     * ============================================================
     */

    if (target.batchId !== EXPECTED_CURRENT_BATCH_ID) {
      fail(
        `Expected current invalid Batch #${EXPECTED_CURRENT_BATCH_ID}, ` +
          `but ReturnBatch #${target.id} currently points to ` +
          `Batch #${target.batchId}. ` +
          `Database state has changed since the repair plan.`,
      );
    }

    console.log(
      `🟢 PASS: ReturnBatch still points to expected invalid Batch #${EXPECTED_CURRENT_BATCH_ID}`,
    );

    const orderItem = target.OrderItem;

    console.log(`
OrderItem #${orderItem.id}

Order #${orderItem.orderId}

Product #${orderItem.productId}

Product="${orderItem.product.name}"

quantity sold=${orderItem.quantity}

returned field=${orderItem.returned}
`);

    /*
     * ============================================================
     * LOAD REPLACEMENT BATCH
     * ============================================================
     */

    const replacementBatch = await tx.batch.findUnique({
      where: {
        id: REPLACEMENT_BATCH_ID,
      },
      include: {
        product: true,
      },
    });

    if (!replacementBatch) {
      fail(
        `Replacement Batch #${REPLACEMENT_BATCH_ID} does not exist.`,
      );
    }

    console.log(`
Replacement Batch #${replacementBatch.id}

Product #${replacementBatch.productId}

Product="${replacementBatch.product.name}"

current quantity=${replacementBatch.quantity}

purchaseCost=${replacementBatch.purchaseCost}

receivedAt=${replacementBatch.receivedAt.toISOString()}

expiryDate=${replacementBatch.expiryDate.toISOString()}

status=${replacementBatch.status}
`);

    /*
     * ============================================================
     * HARD CONTRACT CHECK #3
     *
     * PRODUCT CONSISTENCY
     * ============================================================
     */

    if (replacementBatch.productId !== orderItem.productId) {
      fail(
        `Replacement Batch #${replacementBatch.id} belongs to Product ` +
          `#${replacementBatch.productId}, but OrderItem #${orderItem.id} ` +
          `belongs to Product #${orderItem.productId}.`,
      );
    }

    console.log(
      "🟢 PASS: Replacement batch belongs to the same product as OrderItem",
    );

    /*
     * ============================================================
     * VERIFY REPLACEMENT BATCH WAS ACTUALLY SOLD
     * ============================================================
     */

    const soldOrderBatch = orderItem.batches.find(
      (orderBatch) =>
        orderBatch.batchId === REPLACEMENT_BATCH_ID,
    );

    if (!soldOrderBatch) {
      fail(
        `Batch #${REPLACEMENT_BATCH_ID} is NOT present among the ` +
          `OrderBatch records for OrderItem #${orderItem.id}.`,
      );
    }

    console.log(`
🟢 PASS: Batch #${REPLACEMENT_BATCH_ID} was actually sold through:

OrderBatch #${soldOrderBatch.id}

sold quantity=${soldOrderBatch.quantity}
`);

    /*
     * ============================================================
     * CALCULATE EXISTING RETURNS
     *
     * IMPORTANT:
     *
     * Exclude target ReturnBatch #1 because it currently points
     * to the known invalid Batch #22 and is about to be reassigned.
     * ============================================================
     */

    const alreadyReturnedToReplacementBatch =
      orderItem.ReturnBatch.filter(
        (returnBatch) =>
          returnBatch.id !== TARGET_RETURN_BATCH_ID &&
          returnBatch.batchId === REPLACEMENT_BATCH_ID,
      ).reduce(
        (sum, returnBatch) => sum + returnBatch.quantity,
        0,
      );

    const soldQuantityFromReplacementBatch =
      soldOrderBatch.quantity;

    const remainingReturnCapacity =
      soldQuantityFromReplacementBatch -
      alreadyReturnedToReplacementBatch;

    console.log(`
Return capacity for Batch #${REPLACEMENT_BATCH_ID}

sold=${soldQuantityFromReplacementBatch}

already returned excluding target=${alreadyReturnedToReplacementBatch}

remaining return capacity=${remainingReturnCapacity}

target return quantity=${target.quantity}
`);

    /*
     * ============================================================
     * HARD CONTRACT CHECK #4
     *
     * PER-BATCH RETURN CAPACITY
     * ============================================================
     */

    if (target.quantity > remainingReturnCapacity) {
      fail(
        `Replacement Batch #${REPLACEMENT_BATCH_ID} does not have enough ` +
          `remaining return capacity. ` +
          `Target return quantity=${target.quantity}, ` +
          `available=${remainingReturnCapacity}.`,
      );
    }

    console.log(
      "🟢 PASS: Replacement batch has sufficient return capacity",
    );

    /*
     * ============================================================
     * VERIFY TOTAL RETURN INTEGRITY
     * ============================================================
     */

    const totalReturnBatchQuantity =
      orderItem.ReturnBatch.reduce(
        (sum, returnBatch) => sum + returnBatch.quantity,
        0,
      );

    console.log(`
Total ReturnBatch quantity=${totalReturnBatchQuantity}

OrderItem.returned=${orderItem.returned}

OrderItem.quantity=${orderItem.quantity}
`);

    if (totalReturnBatchQuantity !== orderItem.returned) {
      fail(
        "SUM(ReturnBatch.quantity) does not match OrderItem.returned.",
      );
    }

    if (totalReturnBatchQuantity > orderItem.quantity) {
      fail(
        "Total returned quantity exceeds OrderItem.quantity.",
      );
    }

    console.log(
      "🟢 PASS: Total return quantity integrity is valid before repair",
    );

    /*
     * ============================================================
     * VERIFY THE CURRENT BATCH IS ACTUALLY INVALID
     * ============================================================
     */

    const currentBatchWasSold = orderItem.batches.some(
      (orderBatch) =>
        orderBatch.batchId === EXPECTED_CURRENT_BATCH_ID,
    );

    if (currentBatchWasSold) {
      fail(
        `Current Batch #${EXPECTED_CURRENT_BATCH_ID} is now present ` +
          `among OrderBatch records. The historical repair assumption ` +
          `is no longer valid.`,
      );
    }

    console.log(
      `🟢 PASS: Current Batch #${EXPECTED_CURRENT_BATCH_ID} is confirmed invalid for this OrderItem`,
    );

    /*
     * ============================================================
     * PRE-REPAIR CONTRACT CONFIRMED
     * ============================================================
     */

    line();
    console.log("2. REPAIR AUTHORIZATION CHECK");
    line();

    console.log(`
All required conditions passed:

🟢 Target ReturnBatch exists.
🟢 Target ReturnBatch ID is #${TARGET_RETURN_BATCH_ID}.
🟢 Target OrderItem is #${EXPECTED_ORDER_ITEM_ID}.
🟢 Current Batch is still #${EXPECTED_CURRENT_BATCH_ID}.
🟢 Current Batch is confirmed invalid for this OrderItem.
🟢 Replacement Batch is #${REPLACEMENT_BATCH_ID}.
🟢 Replacement Batch belongs to the correct product.
🟢 Replacement Batch exists in OrderBatch records.
🟢 Replacement Batch has sufficient return capacity.
🟢 Total ReturnBatch quantity matches OrderItem.returned.
🟢 Total returned quantity does not exceed sold quantity.

REPAIR CONTRACT AUTHORIZED.
`);

    /*
     * ============================================================
     * THE ONLY AUTHORIZED DATABASE MODIFICATION
     * ============================================================
     */

    line();
    console.log("3. EXECUTING CONTROLLED REPAIR");
    line();

    console.log(`
Updating only:

ReturnBatch #${TARGET_RETURN_BATCH_ID}

batchId:

#${EXPECTED_CURRENT_BATCH_ID}
→
#${REPLACEMENT_BATCH_ID}
`);

    const updatedReturnBatch = await tx.returnBatch.update({
      where: {
        id: TARGET_RETURN_BATCH_ID,
      },
      data: {
        batchId: REPLACEMENT_BATCH_ID,
      },
      include: {
        Batch: {
          include: {
            product: true,
          },
        },
        OrderItem: {
          include: {
            product: true,
            batches: {
              include: {
                batch: true,
              },
            },
            ReturnBatch: true,
          },
        },
      },
    });

    console.log(`
🟢 UPDATE COMPLETED

ReturnBatch #${updatedReturnBatch.id}

new batchId=${updatedReturnBatch.batchId}
`);

    /*
     * ============================================================
     * POST-REPAIR VALIDATION
     * ============================================================
     */

    line();
    console.log("4. POST-REPAIR VALIDATION");
    line();

    if (
      updatedReturnBatch.batchId !==
      REPLACEMENT_BATCH_ID
    ) {
      fail(
        `Post-repair verification failed. Expected Batch ` +
          `#${REPLACEMENT_BATCH_ID}, but found ` +
          `#${updatedReturnBatch.batchId}.`,
      );
    }

    console.log(
      `🟢 PASS: ReturnBatch now points to Batch #${REPLACEMENT_BATCH_ID}`,
    );

    const repairedOrderItem =
      updatedReturnBatch.OrderItem;

    const repairedSoldBatch =
      repairedOrderItem.batches.find(
        (orderBatch) =>
          orderBatch.batchId === REPLACEMENT_BATCH_ID,
      );

    if (!repairedSoldBatch) {
      fail(
        "Post-repair verification failed: replacement batch " +
          "is not present in OrderBatch records.",
      );
    }

    const returnedToReplacement =
      repairedOrderItem.ReturnBatch.filter(
        (returnBatch) =>
          returnBatch.batchId === REPLACEMENT_BATCH_ID,
      ).reduce(
        (sum, returnBatch) => sum + returnBatch.quantity,
        0,
      );

    console.log(`
Batch #${REPLACEMENT_BATCH_ID}

sold=${repairedSoldBatch.quantity}

returned=${returnedToReplacement}
`);

    if (
      returnedToReplacement >
      repairedSoldBatch.quantity
    ) {
      fail(
        "Post-repair per-batch return limit failed.",
      );
    }

    console.log(
      "🟢 PASS: Returned quantity does not exceed sold quantity for replacement batch",
    );

    const finalReturnTotal =
      repairedOrderItem.ReturnBatch.reduce(
        (sum, returnBatch) => sum + returnBatch.quantity,
        0,
      );

    console.log(`
SUM(ReturnBatch.quantity)=${finalReturnTotal}

OrderItem.returned=${repairedOrderItem.returned}

OrderItem.quantity=${repairedOrderItem.quantity}
`);

    if (
      finalReturnTotal !==
      repairedOrderItem.returned
    ) {
      fail(
        "Post-repair total ReturnBatch quantity no longer matches OrderItem.returned.",
      );
    }

    if (
      finalReturnTotal >
      repairedOrderItem.quantity
    ) {
      fail(
        "Post-repair total returned quantity exceeds sold quantity.",
      );
    }

    console.log(
      "🟢 PASS: Total return integrity remains valid",
    );

    /*
     * Return a minimal summary after successful transaction.
     */

    return {
      returnBatchId: updatedReturnBatch.id,
      orderItemId: updatedReturnBatch.orderItemId,
      oldBatchId: EXPECTED_CURRENT_BATCH_ID,
      newBatchId: updatedReturnBatch.batchId,
      quantity: updatedReturnBatch.quantity,
      productName:
        updatedReturnBatch.OrderItem.product.name,
    };
  });

  /*
   * ============================================================
   * FINAL RESULT
   * ============================================================
   */

  line();
  console.log("FINAL REPAIR RESULT");
  line();

  console.log(`
🟢 RETURNBATCH REPAIR COMPLETED SUCCESSFULLY

ReturnBatch #${result.returnBatchId}

OrderItem #${result.orderItemId}

Product="${result.productName}"

quantity=${result.quantity}

Batch:

#${result.oldBatchId}
→
#${result.newBatchId}

The controlled repair changed ONLY:

ReturnBatch #${result.returnBatchId}.batchId

No OrderItem fields were changed.

No OrderBatch records were changed.

No Batch quantities were changed.

No Batch status was changed.

No Product.stock values were changed.

No Movement records were created.

No Movement records were updated.

No Movement records were deleted.

🏁 RETURNBATCH #1 CONTROLLED REPAIR COMPLETED
`);

  line();
}

main()
  .catch((error) => {
    console.error("\n");
    line("!");
    console.error("REPAIR FAILED");
    line("!");

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    console.error(`
No assumption should be made about database state after an
unexpected runtime failure.

Review the output and run the diagnostic audit again.
`);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });