-- Index for phone-based customer lookup at checkout (reduce buyer friction).
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");
