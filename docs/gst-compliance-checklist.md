# GST & Tax Compliance Checklist
**System:** BikeParts Smart AI  
**Shop:** Ved Scooter Works  

---

> [!WARNING]
> Before entering live production billing, the business owner must review and verify the following items with a registered Chartered Accountant or Tax Practitioner.

## Mandatory Pre-Production Verification Items

- [ ] **1. Legal Business Registration:**
  - Verify whether "Ved Scooter Works" is a Sole Proprietorship, Partnership, or Private Limited entity.
  - Verify if registered legal entity name matches trade name.

- [ ] **2. GSTIN Status:**
  - Confirm active status on the GST Portal (15-character Goods and Services Tax Identification Number).
  - Verify state code (first 2 digits of GSTIN) matches place of business.

- [ ] **3. Composition vs Regular Scheme:**
  - If registered under the **Composition Scheme**, tax cannot be collected from buyers, and invoices must read *"Composition taxable person, not eligible to collect tax on supplies"*.
  - If under **Regular Scheme**, standard CGST/SGST/IGST breakdown applies.

- [ ] **4. Product-Level HSN Classification:**
  - Confirm HSN codes for parts:
    - Two-wheeler parts generally fall under **HSN Chapter 8714** (GST rate commonly 18% or 28%).
    - Lubricants and engine oils fall under **HSN Chapter 2710** (typically 18%).
    - Rubber tubes and tyres fall under **HSN Chapter 4011 / 4013** (typically 18% or 28%).
  - Ensure individual products have their verified HSN code assigned.

- [ ] **5. Intra-State vs Inter-State Tax Rules:**
  - Intra-State (within same state): Split equally into **CGST** + **SGST** (e.g. 9% + 9% for 18%).
  - Inter-State (outside state): **IGST** (e.g. 18%).

- [ ] **6. Invoice Numbering Rules (GST Rule 46):**
  - Invoice numbers must be unique, consecutive, and contain maximum 16 characters containing alphabets, numerals, and special characters `/` or `-`.
  - Configured prefix in system: `VSW-00001` (compliant).

- [ ] **7. E-Invoicing & E-Way Bill Applicability:**
  - Verify if aggregate business turnover exceeds the threshold requiring electronic invoicing portal (IRN) generation.
  - E-way bill is required for single consignments exceeding ₹50,000 for inter-state and specified intra-state limits.
