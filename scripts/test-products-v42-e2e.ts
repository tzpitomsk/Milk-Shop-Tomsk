import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function section(title: string) {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("------------------------------------------------------------------------------");
}

function fail(message: string): never {
  throw new Error(`🔴 ${message}`);
}

async function request(
  path: string,
  options?: RequestInit
): Promise<{
  status: number;
  data: any;
}> {
  const response = await fetch(`${BASE_URL}${path}`, options);

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
  };
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V42 PRODUCT DELETE UI/API INTEGRITY E2E TEST");
  console.log("==============================================================================");
  console.log("");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log("");
  console.log("TEST PURPOSE:");
  console.log("");
  console.log("Product deletion with history must be rejected safely.");
  console.log("DELETE API must return HTTP 400 instead of HTTP 500.");
  console.log("Rejected deletion must not modify Product, Batch or Movement.");
  console.log("Empty products without history must be deletable.");
  console.log("Successful deletion must remove the product completely.");
  console.log("");

  const timestamp = Date.now();

  const productName = `V42_INTEGRATION_TEST Товар ${timestamp}`;
  const emptyProductName = `V42_INTEGRATION_TEST EMPTY ${timestamp}`;

  let productId: number | null = null;
  let emptyProductId: number | null = null;
  let supplierId: number | null = null;
  let supplyId: number | null = null;
  let batchId: number | null = null;

  try {
    // =========================================================================
    // 1. CREATE PRODUCT WITH ZERO STOCK
    // =========================================================================

    section("1. CREATE TEST PRODUCT");

    const createProduct = await request("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: productName,
        unit: "шт",
        price: 500,
        cost: 200,
        barcode: `V42-${timestamp}`,
      }),
    });

    console.log(`POST /api/products`);
    console.log(`HTTP ${createProduct.status}`);
    console.log(JSON.stringify(createProduct.data, null, 2));

    if (createProduct.status !== 200) {
      fail("Не удалось создать тестовый Product");
    }

    productId = Number(createProduct.data?.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      fail("API не вернул корректный Product.id");
    }

    console.log(`Created Product #${productId}`);
    console.log("🟢 Test product created");

    // =========================================================================
    // 2. VERIFY INITIAL DATABASE STATE
    // =========================================================================

    section("2. VERIFY INITIAL DATABASE STATE");

    const initialProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        batches: true,
        movements: true,
        supplyItems: true,
        orderItems: true,
      },
    });

    if (!initialProduct) {
      fail(`Product #${productId} не найден в базе`);
    }

    console.log(`Product.stock=${initialProduct.stock}`);
    console.log(`Batches=${initialProduct.batches.length}`);
    console.log(`Movements=${initialProduct.movements.length}`);
    console.log(`SupplyItems=${initialProduct.supplyItems.length}`);
    console.log(`OrderItems=${initialProduct.orderItems.length}`);

    if (initialProduct.stock !== 0) {
      fail("Новый Product должен иметь stock=0");
    }

    if (initialProduct.batches.length !== 0) {
      fail("У нового Product не должно быть Batch");
    }

    if (initialProduct.movements.length !== 0) {
      fail("У нового Product не должно быть Movement");
    }

    if (initialProduct.supplyItems.length !== 0) {
      fail("У нового Product не должно быть SupplyItem");
    }

    if (initialProduct.orderItems.length !== 0) {
      fail("У нового Product не должно быть OrderItem");
    }

    console.log("🟢 Initial database state is clean");

    // =========================================================================
    // 3. CREATE SUPPLIER
    // =========================================================================

    section("3. CREATE TEST SUPPLIER");

    const createSupplier = await request("/api/suppliers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `V42_INTEGRATION_TEST Supplier ${timestamp}`,
      }),
    });

    console.log(`POST /api/suppliers`);
    console.log(`HTTP ${createSupplier.status}`);
    console.log(JSON.stringify(createSupplier.data, null, 2));

    if (createSupplier.status !== 200) {
      fail("Не удалось создать тестового Supplier");
    }

    supplierId = Number(createSupplier.data?.id);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      fail("API не вернул корректный Supplier.id");
    }

    console.log(`Created Supplier #${supplierId}`);
    console.log("🟢 Supplier created");

    // =========================================================================
    // 4. CREATE SUPPLY
    // =========================================================================

    section("4. CREATE SUPPLY FOR TEST PRODUCT");

    const expiryDate = "2026-12-31";

    const createSupply = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productId,
            quantity: 5,
            cost: 200,
            expiryDate,
          },
        ],
      }),
    });

    console.log(`POST /api/supplies`);
    console.log(`HTTP ${createSupply.status}`);
    console.log(JSON.stringify(createSupply.data, null, 2));

    if (createSupply.status !== 200) {
      fail("Не удалось создать Supply");
    }

    supplyId = Number(createSupply.data?.supply?.id);

    if (!Number.isInteger(supplyId) || supplyId <= 0) {
      fail("API не вернул корректный Supply.id");
    }

    console.log(`Created Supply #${supplyId}`);
    console.log("🟢 Supply created");

    // =========================================================================
    // 5. VERIFY INVENTORY
    // =========================================================================

    section("5. VERIFY INVENTORY BEFORE DELETE");

    const productBeforeDelete = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        batches: true,
        movements: true,
        supplyItems: true,
        orderItems: true,
      },
    });

    if (!productBeforeDelete) {
      fail(`Product #${productId} исчез после Supply`);
    }

    if (productBeforeDelete.batches.length !== 1) {
      fail(
        `Ожидалась 1 Batch, фактически ${productBeforeDelete.batches.length}`
      );
    }

    batchId = productBeforeDelete.batches[0].id;

    const batchQuantityBefore =
      productBeforeDelete.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    const movementCountBefore = productBeforeDelete.movements.length;
    const supplyItemCountBefore =
      productBeforeDelete.supplyItems.length;

    console.log(`Product #${productId}`);
    console.log(`Product.stock=${productBeforeDelete.stock}`);
    console.log(`Batch #${batchId}`);
    console.log(`SUM(Batch.quantity)=${batchQuantityBefore}`);
    console.log(`Movements=${movementCountBefore}`);
    console.log(`SupplyItems=${supplyItemCountBefore}`);
    console.log(`OrderItems=${productBeforeDelete.orderItems.length}`);

    if (productBeforeDelete.stock !== 5) {
      fail(`Ожидался Product.stock=5, получено ${productBeforeDelete.stock}`);
    }

    if (batchQuantityBefore !== 5) {
      fail(`Ожидалась сумма Batch.quantity=5, получено ${batchQuantityBefore}`);
    }

    if (movementCountBefore !== 1) {
      fail(
        `Ожидался 1 Movement после Supply, получено ${movementCountBefore}`
      );
    }

    if (supplyItemCountBefore !== 1) {
      fail(
        `Ожидался 1 SupplyItem, получено ${supplyItemCountBefore}`
      );
    }

    if (productBeforeDelete.orderItems.length !== 0) {
      fail("У тестового Product неожиданно появились OrderItems");
    }

    console.log("🟢 Inventory state before delete is valid");

    // =========================================================================
    // 6. CAPTURE DATABASE SNAPSHOT
    // =========================================================================

    section("6. CAPTURE DATABASE SNAPSHOT BEFORE REJECTED DELETE");

    const batchSnapshot = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    const movementsSnapshot = await prisma.movement.findMany({
      where: {
        productId,
      },
      orderBy: {
        id: "asc",
      },
    });

    const supplyItemsSnapshot = await prisma.supplyItem.findMany({
      where: {
        productId,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (!batchSnapshot) {
      fail(`Batch #${batchId} не найден перед DELETE`);
    }

    console.log(
      `Batch #${batchId}: quantity=${batchSnapshot.quantity}, status=${batchSnapshot.status}`
    );

    console.log(
      `Movement snapshot count=${movementsSnapshot.length}`
    );

    console.log(
      `SupplyItem snapshot count=${supplyItemsSnapshot.length}`
    );

    console.log("🟢 Database snapshot captured");

    // =========================================================================
    // 7. DELETE PRODUCT WITH HISTORY
    // =========================================================================

    section("7. DELETE PRODUCT WITH INVENTORY/HISTORY");

    const deleteResponse = await request(`/api/products/${productId}`, {
      method: "DELETE",
    });

    console.log(`DELETE /api/products/${productId}`);
    console.log(`HTTP ${deleteResponse.status}`);
    console.log(JSON.stringify(deleteResponse.data, null, 2));

    if (deleteResponse.status !== 400) {
      fail(
        `DELETE товара с историей должен вернуть HTTP 400, получено ${deleteResponse.status}`
      );
    }

    if (
      deleteResponse.data?.error !==
      "Товар нельзя удалить, потому что у него есть история складского или торгового учета."
    ) {
      fail(
        "DELETE вернул неправильное сообщение об ошибке"
      );
    }

    if (typeof deleteResponse.data?.details !== "string") {
      fail("DELETE должен вернуть details с причинами блокировки");
    }

    console.log("🟢 Product with history was correctly protected");

    // =========================================================================
    // 8. VERIFY PRODUCT WAS NOT DAMAGED
    // =========================================================================

    section("8. VERIFY DATABASE AFTER REJECTED DELETE");

    const productAfterRejectedDelete =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
        include: {
          batches: true,
          movements: true,
          supplyItems: true,
          orderItems: true,
        },
      });

    if (!productAfterRejectedDelete) {
      fail(
        `Product #${productId} был удалён несмотря на HTTP 400`
      );
    }

    const batchAfterRejectedDelete =
      await prisma.batch.findUnique({
        where: {
          id: batchId,
        },
      });

    if (!batchAfterRejectedDelete) {
      fail(
        `Batch #${batchId} был удалён после отклонённого DELETE`
      );
    }

    console.log(
      `Product #${productId} still exists`
    );

    console.log(
      `Product.stock=${productAfterRejectedDelete.stock}`
    );

    console.log(
      `Batch #${batchId} quantity=${batchAfterRejectedDelete.quantity}`
    );

    console.log(
      `Batch #${batchId} status=${batchAfterRejectedDelete.status}`
    );

    console.log(
      `Movements=${productAfterRejectedDelete.movements.length}`
    );

    console.log(
      `SupplyItems=${productAfterRejectedDelete.supplyItems.length}`
    );

    if (productAfterRejectedDelete.stock !== 5) {
      fail(
        `Product.stock изменился после отклонённого DELETE: ${productAfterRejectedDelete.stock}`
      );
    }

    if (batchAfterRejectedDelete.quantity !== batchSnapshot.quantity) {
      fail(
        `Batch.quantity изменился после отклонённого DELETE: ${batchAfterRejectedDelete.quantity}`
      );
    }

    if (batchAfterRejectedDelete.status !== batchSnapshot.status) {
      fail(
        `Batch.status изменился после отклонённого DELETE: ${batchAfterRejectedDelete.status}`
      );
    }

    if (
      productAfterRejectedDelete.movements.length !==
      movementsSnapshot.length
    ) {
      fail(
        "Количество Movement изменилось после отклонённого DELETE"
      );
    }

    if (
      productAfterRejectedDelete.supplyItems.length !==
      supplyItemsSnapshot.length
    ) {
      fail(
        "Количество SupplyItem изменилось после отклонённого DELETE"
      );
    }

    const movementRowsAfter =
      await prisma.movement.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    if (
      JSON.stringify(movementRowsAfter) !==
      JSON.stringify(movementsSnapshot)
    ) {
      fail(
        "Содержимое Movement изменилось после отклонённого DELETE"
      );
    }

    const supplyItemRowsAfter =
      await prisma.supplyItem.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    if (
      JSON.stringify(supplyItemRowsAfter) !==
      JSON.stringify(supplyItemsSnapshot)
    ) {
      fail(
        "Содержимое SupplyItem изменилось после отклонённого DELETE"
      );
    }

    console.log("🟢 Product remained intact");
    console.log("🟢 Batch remained intact");
    console.log("🟢 Product.stock remained intact");
    console.log("🟢 Movements remained intact");
    console.log("🟢 SupplyItems remained intact");

    // =========================================================================
    // 9. VERIFY API ERROR IS UI-CONSUMABLE
    // =========================================================================

    section("9. VERIFY DELETE ERROR RESPONSE IS UI-CONSUMABLE");

    if (
      typeof deleteResponse.data?.error !== "string" ||
      deleteResponse.data.error.trim().length === 0
    ) {
      fail("DELETE error должен быть непустой строкой");
    }

    if (
      typeof deleteResponse.data?.details !== "string" ||
      deleteResponse.data.details.trim().length === 0
    ) {
      fail("DELETE details должен быть непустой строкой");
    }

    console.log(`error="${deleteResponse.data.error}"`);
    console.log(`details="${deleteResponse.data.details}"`);

    console.log(
      "🟢 API returned a clear error that the UI can display"
    );

    // =========================================================================
    // 10. CREATE EMPTY PRODUCT
    // =========================================================================

    section("10. CREATE EMPTY PRODUCT FOR SUCCESSFUL DELETE");

    const createEmptyProduct = await request("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: emptyProductName,
        unit: "шт",
        price: 300,
        cost: 100,
        barcode: `V42-EMPTY-${timestamp}`,
      }),
    });

    console.log(`POST /api/products`);
    console.log(`HTTP ${createEmptyProduct.status}`);
    console.log(JSON.stringify(createEmptyProduct.data, null, 2));

    if (createEmptyProduct.status !== 200) {
      fail("Не удалось создать пустой Product");
    }

    emptyProductId = Number(createEmptyProduct.data?.id);

    if (!Number.isInteger(emptyProductId) || emptyProductId <= 0) {
      fail("API не вернул корректный empty Product.id");
    }

    if (createEmptyProduct.data?.stock !== 0) {
      fail("Пустой Product должен иметь stock=0");
    }

    console.log(`Created empty Product #${emptyProductId}`);
    console.log("🟢 Empty product created");

    // =========================================================================
    // 11. DELETE EMPTY PRODUCT
    // =========================================================================

    section("11. DELETE EMPTY PRODUCT");

    const deleteEmptyResponse = await request(
      `/api/products/${emptyProductId}`,
      {
        method: "DELETE",
      }
    );

    console.log(`DELETE /api/products/${emptyProductId}`);
    console.log(`HTTP ${deleteEmptyResponse.status}`);
    console.log(JSON.stringify(deleteEmptyResponse.data, null, 2));

    if (deleteEmptyResponse.status !== 200) {
      fail(
        `Пустой Product должен удаляться через HTTP 200, получено ${deleteEmptyResponse.status}`
      );
    }

    if (deleteEmptyResponse.data?.success !== true) {
      fail("DELETE пустого Product не вернул success=true");
    }

    console.log("🟢 Empty product deletion succeeded");

    // Prevent cleanup from trying to delete an already deleted product.
    emptyProductId = null;

    // =========================================================================
    // 12. VERIFY EMPTY PRODUCT IS REALLY GONE
    // =========================================================================

    section("12. VERIFY EMPTY PRODUCT IS COMPLETELY DELETED");

    const deletedEmptyProduct = await prisma.product.findUnique({
      where: {
        id: Number(createEmptyProduct.data.id),
      },
    });

    if (deletedEmptyProduct) {
      fail(
        `Empty Product #${createEmptyProduct.data.id} всё ещё существует`
      );
    }

    console.log(
      `Product #${createEmptyProduct.data.id} not found`
    );

    console.log("🟢 Empty product was deleted completely");

    // =========================================================================
    // 13. FINAL STOCK INTEGRITY
    // =========================================================================

    section("13. FINAL PRODUCT STOCK INTEGRITY");

    const finalProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        batches: true,
      },
    });

    if (!finalProduct) {
      fail(`Основной тестовый Product #${productId} неожиданно отсутствует`);
    }

    const finalBatchTotal = finalProduct.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(`Product.stock=${finalProduct.stock}`);
    console.log(`SUM(Batch.quantity)=${finalBatchTotal}`);

    if (finalProduct.stock !== finalBatchTotal) {
      fail(
        `Нарушен Product.stock invariant: stock=${finalProduct.stock}, batchTotal=${finalBatchTotal}`
      );
    }

    if (finalProduct.stock !== 5) {
      fail(
        `После защищённого DELETE остаток должен остаться 5, получено ${finalProduct.stock}`
      );
    }

    console.log("🟢 FINAL STOCK INVARIANT PASSED");

    // =========================================================================
    // 14. FINAL RESULT
    // =========================================================================

    console.log("");
    console.log("==============================================================================");
    console.log("V42 FINAL RESULT");
    console.log("==============================================================================");
    console.log("");
    console.log("🟢 V42 PASSED");
    console.log("");
    console.log("Verified:");
    console.log("");
    console.log("🟢 Product with inventory cannot be deleted");
    console.log("🟢 Product with history cannot be deleted");
    console.log("🟢 DELETE returns HTTP 400 instead of HTTP 500");
    console.log("🟢 DELETE returns a clear user-facing error");
    console.log("🟢 Rejected DELETE does not remove Product");
    console.log("🟢 Rejected DELETE does not modify Batch");
    console.log("🟢 Rejected DELETE does not modify Product.stock");
    console.log("🟢 Rejected DELETE does not modify Movement");
    console.log("🟢 Rejected DELETE does not modify SupplyItem");
    console.log("🟢 Empty Product can be deleted");
    console.log("🟢 Empty Product is completely removed");
    console.log("🟢 Product.stock = SUM(Batch.quantity)");
    console.log("");
    console.log("==============================================================================");
    console.log("V42 COMPLETED");
    console.log("==============================================================================");
  } finally {
    // ========================================================================
    // CLEANUP
    // ========================================================================

    console.log("");
    console.log("==============================================================================");
    console.log("V42 CLEANUP");
    console.log("==============================================================================");
    console.log("");

    try {
      if (emptyProductId !== null) {
        await prisma.product.delete({
          where: {
            id: emptyProductId,
          },
        });

        console.log(`Deleted leftover empty product #${emptyProductId}`);
      }
    } catch (error: any) {
      if (error?.code !== "P2025") {
        console.error(
          "⚠️ Не удалось удалить leftover empty Product:",
          error
        );
      }
    }

    if (productId !== null) {
      const testOrderItems = await prisma.orderItem.findMany({
        where: {
          productId,
        },
        select: {
          id: true,
        },
      });

      if (testOrderItems.length > 0) {
        const orderItemIds = testOrderItems.map((item) => item.id);

        const deletedReturnBatches =
          await prisma.returnBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted return batches=${deletedReturnBatches.count}`
        );

        const deletedOrderBatches =
          await prisma.orderBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted order batches=${deletedOrderBatches.count}`
        );

        const deletedOrderItems =
          await prisma.orderItem.deleteMany({
            where: {
              id: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted order items=${deletedOrderItems.count}`
        );
      } else {
        console.log("Deleted return batches=0");
        console.log("Deleted order batches=0");
        console.log("Deleted order items=0");
      }

      const deletedMovements =
        await prisma.movement.deleteMany({
          where: {
            productId,
          },
        });

      console.log(
        `Deleted movements=${deletedMovements.count}`
      );

      const deletedSupplyItems =
        await prisma.supplyItem.deleteMany({
          where: {
            productId,
          },
        });

      console.log(
        `Deleted supply items=${deletedSupplyItems.count}`
      );

      const deletedBatches =
        await prisma.batch.deleteMany({
          where: {
            productId,
          },
        });

      console.log(
        `Deleted batches=${deletedBatches.count}`
      );

      const deletedProduct =
        await prisma.product.deleteMany({
          where: {
            id: productId,
          },
        });

      console.log(
        `Deleted products=${deletedProduct.count}`
      );
    }

    if (supplyId !== null) {
      const deletedSupply =
        await prisma.supply.deleteMany({
          where: {
            id: supplyId,
          },
        });

      console.log(
        `Deleted supplies=${deletedSupply.count}`
      );
    }

    if (supplierId !== null) {
      const deletedSupplier =
        await prisma.supplier.deleteMany({
          where: {
            id: supplierId,
          },
        });

      console.log(
        `Deleted suppliers=${deletedSupplier.count}`
      );
    }

    console.log("");
    console.log("🟢 CLEANUP COMPLETED");
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 V42 TEST FAILED");
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });