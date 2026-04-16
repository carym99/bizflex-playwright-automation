/**
 * Secure transfer fixture values from env (with safe defaults for test environment).
 * Keep sensitive values out of spec files.
 */
export function getTransferAccountId(): string {
  return process.env.TRANSFER_ACCOUNT_ID || '226';
}

export function getTransferPin(): string {
  return process.env.TRANSFER_TRANSACTION_PIN || '0707';
}

export function getTransferBankCode(): string {
  return process.env.TRANSFER_BANK_CODE || '232';
}

export function getTransferBeneficiaryAccountName(): string {
  return process.env.TRANSFER_BENEFICIARY_ACCOUNT_NAME || 'BizFlex TestUser';
}

export function getTransferBeneficiaryAccountNumber(): string {
  return process.env.TRANSFER_BENEFICIARY_ACCOUNT_NUMBER || '9710027765';
}

export function getTransferBeneficiaryBankName(): string {
  return process.env.TRANSFER_BENEFICIARY_BANK_NAME || 'Sterling Bank';
}

