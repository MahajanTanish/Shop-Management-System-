# Business Workflows Documentation
**Shop:** Ved Scooter Works  
**Application:** BikeParts Smart AI  

---

## 1. Walk-In Retail Sale Workflow

1. **Initiate Bill:** Employee clicks **Sales & Billing → New Invoice**.
2. **Select Type:** Set to **Retail** (auto-fills Retail Prices from catalogue).
3. **Customer Details:** Keep as Walk-in (or enter customer mobile/name if they request a bill SMS/print).
4. **Scan or Search Parts:** Type part name, SKU, or scan barcode. The system retrieves part description, unit price, and stock status.
5. **Adjust Quantity & Discounts:** Modify quantities. If a promotional discount applies, enter percentage.
6. **Payment Collection:**
   - Enter amount received (Cash, UPI QR, or Card).
   - If paid in full, outstanding balance is ₹0.
7. **Finalize Invoice:**
   - Atomic stored procedure validates available inventory.
   - On confirmation, stock balance is decremented immediately.
   - An immutable stock movement ledger row is created (`movement_type = 'sale'`).
   - Printer prints formatted bill receipt.

---

## 2. Wholesale / Mechanic Credit Sale Workflow

1. **Initiate Bill:** Select **Wholesale Invoice** mode.
2. **Customer Selection:** Select existing registered workshop or mechanic account (e.g. "Ramesh Auto Garage").
3. **Credit Limit Check:** System highlights customer's current outstanding balance and available credit headroom.
4. **Add Items:** Parts auto-load wholesale contract pricing.
5. **Partial or Zero Payment:**
   - If mechanic takes parts on credit, enter ₹0 (or partial token advance).
   - The remaining unpaid balance automatically posts to the customer's outstanding balance.
6. **Invoice Finalization:**
   - Customer's statement of account (Ledger) reflects a new debit entry.

---

## 3. Customer Payment Intake & Reconciliation Workflow

1. Navigate to **Customers → [Customer Detail]** or **Payments & Credit**.
2. Click **Record Payment Receipt**.
3. Select customer, enter amount collected (e.g. ₹5,000 received via UPI), payment date, and transaction reference/UTR.
4. System automatically:
   - Decreases the customer's total outstanding balance.
   - Reconciles oldest unpaid finalized invoices on a First-In, First-Out (FIFO) basis.
   - Adds an immutable credit entry to the customer's Statement of Account.

---

## 4. Supplier Purchase & Stock Intake Workflow

1. Navigate to **Purchases → New Purchase Entry**.
2. Select distributor/supplier and enter vendor invoice reference number.
3. Search and add spare parts received in shipment with their purchase cost and tax rate.
4. Two paths:
   - **Save as Draft PO:** For verifying shipments before goods arrive. Stock does not change.
   - **Receive & Add to Stock:** Immediately increments stock balances, logs `purchase_receipt` movements, updates product cost benchmarks, and logs accounts payable balance to the supplier.

---

## 5. Stock Count & Physical Inventory Adjustment Workflow

1. Navigate to **Inventory → Stock Adjustment**.
2. Search part.
3. Input delta (+/- quantity) with a mandatory business reason (e.g., *"Physical count audit"*, *"Damaged during unboxing"*).
4. Transaction requires manager or owner approval.
5. Both `stock_balances` and `stock_movements` update synchronously with full actor traceability.
