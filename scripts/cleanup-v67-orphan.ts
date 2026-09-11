import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const productId = 108;
  const supplyId = 112;
  const supplierId = 54;
  const supplyItemId = 122;

  console.log("");
  console.log("============================================================");
  console.log("V67 ORPHAN CLEANUP");
  console.log("============================================================");
  console.log("");
  console.log("Target:");
  console.log(`Product #${productId}`);
  console.log(`Supply #${supplyId}`);
  console.log(`Supplier #${supplierId}`);
  console.log(`SupplyItem #${supplyItemId}`);
  console.log("");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      batches: true,
      supplyItems: true,
      orderItems: true,
      movements: true,
    },
  });

  if (!product) {
    throw new Error(`Product #${productId} not found.`);
  }

  console.log(`Product: "${product.name}"`);

  if (!product.name.startsWith("V67_PRODUCT_TRADE_HISTORY_TEST_")) {
    throw new Error("SAFETY STOP: Product name is not the expected V67 test product.");
  }

  if (product.barcode !== "V67-1789030961440") {
    throw new Error("SAFETY STOP: Product barcode does not match the expected V67 test product.");
  }

  if (product.batches.length !== 0) {
    throw new Error(
      `SAFETY STOP: Product has ${product.batches.length} Batch record(s).`
    );
  }

  if (product.orderItems.length !== 0) {
    throw new Error(
      `SAFETY STOP: Product has ${product.orderItems.length} OrderItem record(s).`
    );
  }

  if (product.movements.length !== 0) {
    throw new Error(
      `SAFETY STOP: Product has ${product.movements.length} Movement record(s).`
    );
  }

  if (
    product.supplyItems.length !== 1 ||
    product.supplyItems[0].id !== supplyItemId ||
    product.supplyItems[0].supplyId !== supplyId
  ) {
    throw new Error(
      "SAFETY STOP: Product does not have exactly the expected SupplyItem #122 → Supply #112 relationship."
    );
  }

  console.log("🟢 Product safety checks passed");

  const supplyItem = await prisma.supplyItem.findUnique({
    where: { id: supplyItemId },
    include: {
      product: true,
      supply: {
        include: {
          Supplier: true,
          items: true,
        },
      },
    },
  });

  if (!supplyItem) {
    throw new Error(`SupplyItem #${supplyItemId} not found.`);
  }

  if (supplyItem.productId !== productId) {
    throw new Error("SAFETY STOP: SupplyItem points to another Product.");
  }

  if (supplyItem.supplyId !== supplyId) {
    throw new Error("SAFETY STOP: SupplyItem points to another Supply.");
  }

  if (supplyItem.quantity !== 5 || supplyItem.cost !== 100) {
    throw new Error("SAFETY STOP: SupplyItem data does not match expected V67 test data.");
  }

  if (supplyItem.supply.items.length !== 1) {
    throw new Error(
      `SAFETY STOP: Supply #${supplyId} has ${supplyItem.supply.items.length} item(s).`
    );
  }

  console.log("🟢 SupplyItem safety checks passed");

  const supply = supplyItem.supply;

  if (supply.id !== supplyId) {
    throw new Error("SAFETY STOP: Wrong Supply loaded.");
  }

  if (supply.supplierId !== supplierId) {
    throw new Error("SAFETY STOP: Supply belongs to another Supplier.");
  }

  if (supply.total !== 500) {
    throw new Error("SAFETY STOP: Supply total does not match expected V67 test data.");
  }

  if (supply.items[0].id !== supplyItemId) {
    throw new Error("SAFETY STOP: Supply contains an unexpected SupplyItem.");
  }

  console.log("🟢 Supply safety checks passed");

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      Supply: true,
    },
  });

  if (!supplier) {
    throw new Error(`Supplier #${supplierId} not found.`);
  }

  if (!supplier.name.startsWith("V67_PRODUCT_TRADE_HISTORY_SUPPLIER_")) {
    throw new Error("SAFETY STOP: Supplier name is not the expected V67 test supplier.");
  }

  if (supplier.Supply.length !== 1 || supplier.Supply[0].id !== supplyId) {
    throw new Error(
      "SAFETY STOP: Supplier has another Supply record."
    );
  }

  console.log("🟢 Supplier safety checks passed");

  const relatedReturns = await prisma.returnBatch.findMany({
    where: {
      OR: [
        {
          OrderItem: {
            productId,
          },
        },
        {
          Batch: {
            productId,
          },
        },
      ],
    },
  });

  if (relatedReturns.length !== 0) {
    throw new Error(
      `SAFETY STOP: Product has ${relatedReturns.length} related ReturnBatch record(s).`
    );
  }

  console.log("🟢 ReturnBatch safety check passed");

  console.log("");
  console.log("============================================================");
  console.log("ALL SAFETY CHECKS PASSED");
  console.log("============================================================");
  console.log("");
  console.log("Records that will be deleted:");
  console.log(`- SupplyItem #${supplyItemId}`);
  console.log(`- Supply #${supplyId}`);
  console.log(`- Supplier #${supplierId}`);
  console.log(`- Product #${productId}`);
  console.log("");

  await prisma.$transaction(async (tx) => {
    await tx.supplyItem.delete({
      where: { id: supplyItemId },
    });

    await tx.supply.delete({
      where: { id: supplyId },
    });

    await tx.supplier.delete({
      where: { id: supplierId },
    });

    await tx.product.delete({
      where: { id: productId },
    });
  });

  console.log("🟢 Cleanup completed");
  console.log("");
  console.log("Deleted only the confirmed old V67 test records.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 CLEANUP STOPPED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
