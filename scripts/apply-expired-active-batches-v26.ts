/**
 * scripts/apply-expired-active-batches-v26.ts
 *
 * APPLY V26 — SAFE EXPIRED ACTIVE BATCH WRITE-OFF
 *
 * Approved by DRY-RUN V25:
 *
 * Batch #28 → Молоко   → 10 шт.
 * Batch #29 → Творог   → 10 шт.
 * Batch #30 → Сметана  → 10 шт.
 * Batch #31 → Кефир    → 10 шт.
 *
 * TOTAL = 40 units
 *
 * SAFETY:
 * - Creates a database backup before modification.
 * - Validates all target batches before APPLY.
 * - Revalidates all target batches inside the transaction.
 * - Only exact approved batch IDs can be modified.
 * - Requires quantity to still be exactly 10.
 * - Requires status ACTIVE.
 * - Requires expiryDate < now.
 * - Requires zero OrderBatch references.
 * - Requires zero ReturnBatch references.
 * - Sets Batch.quantity = 0.
 * - Sets Batch.status = EXPIRED.
 * - Recalculates Product.stock from Batch quantities.
 * - Creates WRITE_OFF Movement records.
 *
 * DOES NOT MODIFY:
 * - Order
 * - OrderItem
 * - OrderBatch
 * - ReturnBatch
 * - Supply
 * - SupplyItem
 *
 * RUN:
 *
 *   npx tsc --noEmit
 *   npx tsx scripts/apply-expired-active-batches-v26.ts
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const TARGETS = [
  {
    batchId: 28,
    productId: 1,
    productName: "Молоко",
    expectedQuantity: 10,
    expectedPurchaseCost: 120,
  },
  {
    batchId: 29,
    productId: 2,
    productName: "Творог",
    expectedQuantity: 10,
    expectedPurchaseCost: 200,
  },
  {
    batchId: 30,
    productId: 3,
    productName: "Сметана",
    expectedQuantity: 10,
    expectedPurchaseCost: 350,
  },
  {
    batchId: 31,
    productId: 4,
    productName: "Кефир",
    expectedQuantity: 10,
    expectedPurchaseCost: 100,
  },
] as const;

const EXPECTED_TOTAL = TARGETS.reduce(
  (sum, target) => sum + target.expectedQuantity,
  0,
);

type ValidatedBatch = {
  batchId: number;
  productId: number;
  productName: string;
  quantity: number;
  purchaseCost: number;
  expiryDate: Date;
  receivedAt: Date;
};

function separator() {
  console.log(
    "\n==============================================================================\n",
  );
}

function formatDate(date: Date) {
  return date.toISOString();
}

async function createBackup() {
  const dbPath = path.resolve(process.cwd(), "prisma", "dev.db");

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupPath = path.resolve(
    process.cwd(),
    "prisma",
    `dev_backup_before_v26_${timestamp}.db`,
  );

  fs.copyFileSync(dbPath, backupPath);

  console.log("DATABASE BACKUP CREATED:");
  console.log(`  ${backupPath}`);

  return backupPath;
}

/**
 * Validate the exact four batches before changing anything.
 */
async function validateTargets(now: Date): Promise<ValidatedBatch[]> {
  console.log("\n1. PRE-APPLY VALIDATION");
  separator();

  console.log("Audit time =", formatDate(now));
  console.log("Expected target batches =", TARGETS.length);
  console.log("Expected total write-off =", EXPECTED_TOTAL);

  const validated: ValidatedBatch[] = [];

  for (const target of TARGETS) {
    const batch = await prisma.batch.findUnique({
      where: {
        id: target.batchId,
      },
      include: {
        product: true,
        orderBatches: {
          include: {
            orderItem: {
              include: {
                order: true,
              },
            },
          },
        },
        ReturnBatch: {
          include: {
            OrderItem: {
              include: {
                order: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new Error(
        `VALIDATION FAILED: Batch #${target.batchId} does not exist.`,
      );
    }

    console.log(`\nBatch #${batch.id}`);
    console.log(
      `  Product      = #${batch.productId} "${batch.product.name}"`,
    );
    console.log(`  quantity     = ${batch.quantity}`);
    console.log(`  purchaseCost = ${batch.purchaseCost}`);
    console.log(`  receivedAt   = ${formatDate(batch.receivedAt)}`);
    console.log(`  expiryDate   = ${formatDate(batch.expiryDate)}`);
    console.log(`  status       = ${batch.status}`);
    console.log(
      `  OrderBatch   = ${batch.orderBatches.length}`,
    );
    console.log(
      `  ReturnBatch  = ${batch.ReturnBatch.length}`,
    );

    if (batch.productId !== target.productId) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} belongs to Product #${batch.productId}, expected Product #${target.productId}.`,
      );
    }

    if (batch.product.name !== target.productName) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} product name is "${batch.product.name}", expected "${target.productName}".`,
      );
    }

    if (batch.quantity !== target.expectedQuantity) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} quantity is ${batch.quantity}, expected exactly ${target.expectedQuantity}.`,
      );
    }

    if (batch.purchaseCost !== target.expectedPurchaseCost) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} purchaseCost is ${batch.purchaseCost}, expected ${target.expectedPurchaseCost}.`,
      );
    }

    if (batch.status !== "ACTIVE") {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} status is "${batch.status}", expected ACTIVE.`,
      );
    }

    if (batch.expiryDate >= now) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} is not expired. expiryDate=${formatDate(batch.expiryDate)}`,
      );
    }

    if (batch.receivedAt > batch.expiryDate) {
      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} receivedAt is after expiryDate.`,
      );
    }

    if (batch.orderBatches.length > 0) {
      console.error("\nORDERBATCH REFERENCES FOUND:");

      for (const link of batch.orderBatches) {
        console.error(
          `  OrderBatch #${link.id} | quantity=${link.quantity} | OrderItem #${link.orderItemId} | Order #${link.orderItem.orderId}`,
        );
      }

      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} has OrderBatch references. APPLY stopped.`,
      );
    }

    if (batch.ReturnBatch.length > 0) {
      console.error("\nRETURNBATCH REFERENCES FOUND:");

      for (const link of batch.ReturnBatch) {
        console.error(
          `  ReturnBatch #${link.id} | quantity=${link.quantity} | OrderItem #${link.orderItemId} | Order #${link.OrderItem.orderId}`,
        );
      }

      throw new Error(
        `VALIDATION FAILED: Batch #${batch.id} has ReturnBatch references. APPLY stopped.`,
      );
    }

    validated.push({
      batchId: batch.id,
      productId: batch.productId,
      productName: batch.product.name,
      quantity: batch.quantity,
      purchaseCost: batch.purchaseCost,
      expiryDate: batch.expiryDate,
      receivedAt: batch.receivedAt,
    });

    console.log("  🟢 VALIDATED");
  }

  const actualTotal = validated.reduce(
    (sum, batch) => sum + batch.quantity,
    0,
  );

  if (actualTotal !== EXPECTED_TOTAL) {
    throw new Error(
      `VALIDATION FAILED: total quantity=${actualTotal}, expected=${EXPECTED_TOTAL}.`,
    );
  }

  console.log("\n🟢 ALL TARGET BATCHES PASSED VALIDATION.");
  console.log(
    `Total quantity approved for write-off = ${actualTotal}`,
  );

  return validated;
}

/**
 * Verify Product.stock equals the sum of all Batch.quantity
 * before the APPLY.
 */
async function validateProductStock(productIds: number[]) {
  console.log("\n2. PRODUCT STOCK PRE-CHECK");
  separator();

  for (const productId of productIds) {
    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        batches: true,
      },
    });

    if (!product) {
      throw new Error(
        `VALIDATION FAILED: Product #${productId} does not exist.`,
      );
    }

    const batchTotal = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0,
    );

    console.log(`\nProduct #${product.id} "${product.name}"`);
    console.log(`  Product.stock = ${product.stock}`);
    console.log(`  Batch total   = ${batchTotal}`);

    if (product.stock !== batchTotal) {
      throw new Error(
        `VALIDATION FAILED: Product #${product.id} stock=${product.stock}, Batch total=${batchTotal}.`,
      );
    }

    console.log("  🟢 Product.stock matches Batch total.");
  }
}

/**
 * Apply all changes inside ONE transaction.
 */
async function applyWriteOff(
  validated: ValidatedBatch[],
) {
  console.log("\n3. APPLY TRANSACTION");
  separator();

  console.log("Starting database transaction...");
  console.log("All four batch write-offs will be atomic.");

  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();

      /**
       * ----------------------------------------------------------
       * STEP 1 — REVALIDATE INSIDE TRANSACTION
       * ----------------------------------------------------------
       */
      for (const target of TARGETS) {
        const batch = await tx.batch.findUnique({
          where: {
            id: target.batchId,
          },
          include: {
            orderBatches: true,
            ReturnBatch: true,
          },
        });

        if (!batch) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} does not exist.`,
          );
        }

        if (batch.productId !== target.productId) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} productId changed.`,
          );
        }

        if (batch.quantity !== target.expectedQuantity) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} quantity changed. Current=${batch.quantity}, expected=${target.expectedQuantity}.`,
          );
        }

        if (batch.purchaseCost !== target.expectedPurchaseCost) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} purchaseCost changed.`,
          );
        }

        if (batch.status !== "ACTIVE") {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} status changed to "${batch.status}".`,
          );
        }

        if (batch.expiryDate >= now) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} is no longer expired.`,
          );
        }

        if (batch.orderBatches.length !== 0) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} now has OrderBatch references.`,
          );
        }

        if (batch.ReturnBatch.length !== 0) {
          throw new Error(
            `TRANSACTION VALIDATION FAILED: Batch #${target.batchId} now has ReturnBatch references.`,
          );
        }
      }

      /**
       * ----------------------------------------------------------
       * STEP 2 — UPDATE BATCHES
       * ----------------------------------------------------------
       */
      const updatedBatches: Array<{
        batchId: number;
        productId: number;
        productName: string;
        quantity: number;
        purchaseCost: number;
        expiryDate: Date;
      }> = [];

      for (const target of TARGETS) {
        const batch = await tx.batch.update({
          where: {
            id: target.batchId,
          },
          data: {
            quantity: 0,
            status: "EXPIRED",
          },
          include: {
            product: true,
          },
        });

        console.log(
          `  Batch #${batch.id}: ${target.expectedQuantity} → 0 | ACTIVE → EXPIRED`,
        );

        updatedBatches.push({
          batchId: batch.id,
          productId: batch.productId,
          productName: batch.product.name,
          quantity: target.expectedQuantity,
          purchaseCost: batch.purchaseCost,
          expiryDate: batch.expiryDate,
        });
      }

      /**
       * ----------------------------------------------------------
       * STEP 3 — RECALCULATE PRODUCT.STOCK
       * ----------------------------------------------------------
       *
       * Product.stock is rebuilt from Batch.quantity.
       * We do not simply subtract 10.
       */
      const productIds = [
        ...new Set(
          TARGETS.map((target) => target.productId),
        ),
      ];

      const updatedProducts: Array<{
        productId: number;
        productName: string;
        oldStock: number;
        newStock: number;
      }> = [];

      for (const productId of productIds) {
        const product = await tx.product.findUnique({
          where: {
            id: productId,
          },
          include: {
            batches: true,
          },
        });

        if (!product) {
          throw new Error(
            `TRANSACTION FAILED: Product #${productId} not found during stock recalculation.`,
          );
        }

        const oldStock = product.stock;

        const newStock = product.batches.reduce(
          (sum, batch) => sum + batch.quantity,
          0,
        );

        await tx.product.update({
          where: {
            id: productId,
          },
          data: {
            stock: newStock,
          },
        });

        console.log(
          `  Product #${product.id} "${product.name}": stock ${oldStock} → ${newStock}`,
        );

        updatedProducts.push({
          productId,
          productName: product.name,
          oldStock,
          newStock,
        });
      }

      /**
       * ----------------------------------------------------------
       * STEP 4 — CREATE WRITE-OFF MOVEMENTS
       * ----------------------------------------------------------
       *
       * Current Movement model does not have batchId.
       * Therefore the exact batch number is stored in comment.
       *
       * quantity is negative because this is stock removal.
       */
      const movements: Array<{
        id: number;
        productId: number;
        quantity: number;
        comment: string | null;
      }> = [];

      for (const batch of updatedBatches) {
        const movement = await tx.movement.create({
          data: {
            type: "WRITE_OFF",
            quantity: -batch.quantity,
            comment:
              `Списание просроченной партии Batch #${batch.batchId}. ` +
              `Срок годности: ${formatDate(batch.expiryDate)}. ` +
              `Количество: ${batch.quantity} шт.`,
            productId: batch.productId,
          },
        });

        movements.push({
          id: movement.id,
          productId: movement.productId,
          quantity: movement.quantity,
          comment: movement.comment,
        });

        console.log(
          `  Movement #${movement.id}: WRITE_OFF ${movement.quantity} | Product #${batch.productId} "${batch.productName}" | Batch #${batch.batchId}`,
        );
      }

      return {
        updatedBatches,
        updatedProducts,
        movements,
      };
    },
    {
      maxWait: 10_000,
      timeout: 20_000,
    },
  );

  return result;
}

/**
 * Verify final database state after successful transaction.
 */
async function finalVerification() {
  console.log("\n4. FINAL VERIFICATION");
  separator();

  const targetBatchIds = TARGETS.map(
    (target) => target.batchId,
  );

  const targetProductIds = TARGETS.map(
    (target) => target.productId,
  );

  /**
   * ----------------------------------------------------------
   * Verify batches
   * ----------------------------------------------------------
   */
  const batches = await prisma.batch.findMany({
    where: {
      id: {
        in: targetBatchIds,
      },
    },
    include: {
      product: true,
      orderBatches: true,
      ReturnBatch: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  if (batches.length !== TARGETS.length) {
    throw new Error(
      `FINAL VERIFICATION FAILED: Expected ${TARGETS.length} target batches, found ${batches.length}.`,
    );
  }

  for (const batch of batches) {
    console.log(`\nBatch #${batch.id}`);
    console.log(`  Product     = ${batch.product.name}`);
    console.log(`  quantity    = ${batch.quantity}`);
    console.log(`  status      = ${batch.status}`);
    console.log(
      `  expiryDate  = ${formatDate(batch.expiryDate)}`,
    );
    console.log(
      `  OrderBatch  = ${batch.orderBatches.length}`,
    );
    console.log(
      `  ReturnBatch = ${batch.ReturnBatch.length}`,
    );

    if (batch.quantity !== 0) {
      throw new Error(
        `FINAL VERIFICATION FAILED: Batch #${batch.id} quantity=${batch.quantity}, expected 0.`,
      );
    }

    if (batch.status !== "EXPIRED") {
      throw new Error(
        `FINAL VERIFICATION FAILED: Batch #${batch.id} status="${batch.status}", expected EXPIRED.`,
      );
    }

    if (batch.orderBatches.length !== 0) {
      throw new Error(
        `FINAL VERIFICATION FAILED: Batch #${batch.id} has OrderBatch references.`,
      );
    }

    if (batch.ReturnBatch.length !== 0) {
      throw new Error(
        `FINAL VERIFICATION FAILED: Batch #${batch.id} has ReturnBatch references.`,
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * Verify Product.stock
   * ----------------------------------------------------------
   */
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: targetProductIds,
      },
    },
    include: {
      batches: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  if (products.length !== TARGETS.length) {
    throw new Error(
      `FINAL VERIFICATION FAILED: Expected ${TARGETS.length} products, found ${products.length}.`,
    );
  }

  for (const product of products) {
    const batchTotal = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0,
    );

    console.log(`\nProduct #${product.id} "${product.name}"`);
    console.log(`  Product.stock = ${product.stock}`);
    console.log(`  Batch total   = ${batchTotal}`);

    if (product.stock !== batchTotal) {
      throw new Error(
        `FINAL VERIFICATION FAILED: Product #${product.id} stock=${product.stock}, Batch total=${batchTotal}.`,
      );
    }

    console.log("  🟢 Stock synchronized.");
  }

  /**
   * ----------------------------------------------------------
   * Verify WRITE_OFF movements
   * ----------------------------------------------------------
   */
  console.log("\nWRITE_OFF MOVEMENTS:");

  for (const target of TARGETS) {
    const movement = await prisma.movement.findFirst({
      where: {
        type: "WRITE_OFF",
        productId: target.productId,
        quantity: -target.expectedQuantity,
        comment: {
          contains: `Batch #${target.batchId}`,
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    if (!movement) {
      throw new Error(
        `FINAL VERIFICATION FAILED: WRITE_OFF movement for Batch #${target.batchId} not found.`,
      );
    }

    console.log(
      `  🟢 Movement #${movement.id} | Product #${movement.productId} | quantity=${movement.quantity} | ${movement.comment}`,
    );
  }

  /**
   * ----------------------------------------------------------
   * Global Product.stock ↔ Batch check
   * ----------------------------------------------------------
   */
  console.log("\nGLOBAL STOCK CONSISTENCY CHECK:");

  const allProducts = await prisma.product.findMany({
    include: {
      batches: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  let globalDifferences = 0;

  for (const product of allProducts) {
    const batchTotal = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0,
    );

    if (product.stock !== batchTotal) {
      globalDifferences++;

      console.error(
        `  🔴 Product #${product.id} "${product.name}" | stock=${product.stock} | batches=${batchTotal}`,
      );
    }
  }

  if (globalDifferences > 0) {
    throw new Error(
      `FINAL VERIFICATION FAILED: ${globalDifferences} Product.stock mismatches found.`,
    );
  }

  console.log("  🟢 All Product.stock values match Batch totals.");

  console.log("\n🟢 FINAL VERIFICATION PASSED.");
}

async function main() {
  separator();

  console.log(
    "APPLY V26 — EXPIRED ACTIVE BATCH WRITE-OFF",
  );

  separator();

  console.log("⚠️ THIS SCRIPT WILL MODIFY THE DATABASE.");
  console.log("");
  console.log("EXACT APPROVED TARGETS:");

  for (const target of TARGETS) {
    console.log(
      `  Batch #${target.batchId} | Product #${target.productId} "${target.productName}" | quantity=${target.expectedQuantity}`,
    );
  }

  console.log("");
  console.log(
    `TOTAL APPROVED WRITE-OFF = ${EXPECTED_TOTAL} units`,
  );

  separator();

  /**
   * Backup FIRST.
   */
  const backupPath = await createBackup();

  console.log("");
  console.log(
    `Backup available at: ${backupPath}`,
  );

  try {
    /**
     * --------------------------------------------------------
     * PRE-APPLY VALIDATION
     * --------------------------------------------------------
     */
    const now = new Date();

    const validated = await validateTargets(now);

    /**
     * --------------------------------------------------------
     * PRODUCT STOCK PRE-CHECK
     * --------------------------------------------------------
     */
    const productIds = [
      ...new Set(
        validated.map((batch) => batch.productId),
      ),
    ];

    await validateProductStock(productIds);

    /**
     * --------------------------------------------------------
     * APPLY
     * --------------------------------------------------------
     */
    const result = await applyWriteOff(validated);

    console.log("\nAPPLY RESULT");
    separator();

    console.log(
      `Updated batches  = ${result.updatedBatches.length}`,
    );

    console.log(
      `Updated products = ${result.updatedProducts.length}`,
    );

    console.log(
      `Created movements = ${result.movements.length}`,
    );

    const writtenOffTotal =
      result.updatedBatches.reduce(
        (sum, batch) => sum + batch.quantity,
        0,
      );

    console.log(
      `Total written off = ${writtenOffTotal}`,
    );

    if (writtenOffTotal !== EXPECTED_TOTAL) {
      throw new Error(
        `APPLY RESULT FAILED: written off ${writtenOffTotal}, expected ${EXPECTED_TOTAL}.`,
      );
    }

    /**
     * --------------------------------------------------------
     * FINAL VERIFICATION
     * --------------------------------------------------------
     */
    await finalVerification();

    separator();

    console.log(
      "🏁 APPLY V26 COMPLETED SUCCESSFULLY",
    );

    console.log("");
    console.log(
      `Total expired stock written off = ${writtenOffTotal} units`,
    );

    console.log("");
    console.log("BATCH CHANGES:");

    console.log(
      "  Batch #28 | Молоко   | 10 → 0 | ACTIVE → EXPIRED",
    );

    console.log(
      "  Batch #29 | Творог   | 10 → 0 | ACTIVE → EXPIRED",
    );

    console.log(
      "  Batch #30 | Сметана  | 10 → 0 | ACTIVE → EXPIRED",
    );

    console.log(
      "  Batch #31 | Кефир    | 10 → 0 | ACTIVE → EXPIRED",
    );

    console.log("");
    console.log(
      "Product.stock was recalculated from Batch totals.",
    );

    console.log(
      "WRITE_OFF movements were created.",
    );

    console.log("");
    console.log(
      "Historical orders were NOT modified.",
    );

    console.log(
      "OrderBatch was NOT modified.",
    );

    console.log(
      "ReturnBatch was NOT modified.",
    );

    console.log(
      "Supply was NOT modified.",
    );

    console.log(
      "SupplyItem was NOT modified.",
    );

    console.log("");
    console.log(
      `Backup: ${backupPath}`,
    );

    separator();
  } catch (error) {
    console.error("\n❌ APPLY V26 FAILED.");
    console.error("");

    console.error(
      "The database transaction was rolled back.",
    );

    console.error(
      "No partial Batch/Product/Movement changes should remain from the failed transaction.",
    );

    console.error("");
    console.error(
      `Backup remains available at: ${backupPath}`,
    );

    console.error("");
    console.error("ERROR DETAILS:");

    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });