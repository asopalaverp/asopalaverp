import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { Branch } from '@/types/database';

/**
 * Canonical showroom catalog covering all 9 Asopalav store branches
 */
export const DEFAULT_BRANCHES: Branch[] = [
  {
    branch_id: 'Aellp-ASI',
    branch_code: 'ASI',
    branch_name: 'Asopalav - Satellite Flagship',
    short_name: 'Satellite',
    entity_company_name: 'Asopalav Endeavours LLP',
    accountant_name: 'Hemendra Bhai',
    contact_phone: '+91 9925009050',
    contact_email: 'satellite@asopalav.com',
    city: 'Ahmedabad',
    state: 'Gujarat',
    address: 'Satellite Road, Ahmedabad - 380015',
    min_cash_threshold: 3000,
    max_cash_ceiling: 25000,
    max_upi_ceiling: 50000,
    is_active: true,
  },
];

/**
 * Normalizes any branch identifier (e.g. 'Aellp-AP', 'AP', 'aellp-ap', 'aellp-asm') into canonical uppercase code (e.g. 'AP', 'ASM', 'ASI')
 */
export function normalizeBranchCode(branchCodeOrId?: string | null): string {
  if (!branchCodeOrId || typeof branchCodeOrId !== 'string') return 'ASI';
  const clean = branchCodeOrId.trim();
  if (!clean || clean.toUpperCase() === 'ALL') return 'ALL';
  return clean.replace(/^[Aa][Ee][Ll]{2}[Pp]-/, '').toUpperCase();
}

/**
 * Normalizes any branch identifier into canonical database branch ID (e.g. 'Aellp-AP', 'Aellp-ASM', 'ALL')
 */
export function normalizeBranchId(branchCodeOrId?: string | null): string {
  const code = normalizeBranchCode(branchCodeOrId);
  if (code === 'ALL') return 'ALL';
  return `Aellp-${code}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as Indian Currency (e.g. ₹ 1,425.00, ₹ 83,488.00, ₹ 14.25 L)
 */
export function formatINR(amount: number, compact: boolean = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0.00';
  
  if (compact && Math.abs(amount) >= 100000) {
    const inLakhs = amount / 100000;
    return `₹${inLakhs.toFixed(2)}L`;
  }

  const formatted = Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `₹${formatted}`;
}

/**
 * Formats a date string into readable Indian retail format (e.g. 14-Sep-2026, 14-Sep-26)
 */
export function formatDate(dateString: string | Date, formatStr: string = 'dd-MMM-yyyy'): string {
  if (!dateString) return '-';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, formatStr);
  } catch {
    return String(dateString);
  }
}

/**
 * Formats an Indian mobile phone number to standard +91 XXXXX XXXXX format
 */
export function formatIndianPhone(phone?: string | null): string {
  if (!phone || phone.trim() === '' || phone.trim() === '-' || phone.trim().toLowerCase() === 'null') return '—';
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return '—';
  if (cleaned.startsWith('91') && cleaned.length > 2) {
    const raw = cleaned.slice(2, 12);
    if (raw.length <= 5) return `+91 ${raw}`;
    return `+91 ${raw.slice(0, 5)} ${raw.slice(5, 10)}`;
  }
  const raw = cleaned.slice(0, 10);
  if (raw.length <= 5) return `+91 ${raw}`;
  return `+91 ${raw.slice(0, 5)} ${raw.slice(5, 10)}`;
}

/**
 * Normalizes input in realtime for telephone fields ensuring +91 prefix is maintained when typing
 */
export function cleanIndianPhoneInput(val: string): string {
  if (!val || val.trim() === '' || val.trim() === '+' || val.trim() === '+9' || val.trim() === '+91') {
    return '';
  }
  let digits = val.replace(/[^0-9]/g, '');
  if (digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 5) return `+91 ${digits}`;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}

/**
 * Returns pastel badge color styles based on category/department theme from our 8-color designer palette
 */
export function getCategoryBadgeStyle(themeName: string = 'Vanilla'): { bg: string; text: string; dot: string } {
  switch (themeName?.toLowerCase()) {
    case 'emerald':
    case 'fabric':
    case 'food & beverage':
    case 'tea & refreshments':
      return {
        bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
        text: 'text-emerald-600 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      };
    case 'sky blue':
    case 'computer':
    case 'it':
    case 'online':
      return {
        bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
        text: 'text-blue-600 dark:text-blue-400',
        dot: 'bg-blue-500',
      };
    case 'peach':
    case 'dry cleaning':
    case 'advance':
    case 'staff loan':
      return {
        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
      };
    case 'electric lime':
    case 'dyeing':
    case 'freight':
    case 'courier':
      return {
        bg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
        text: 'text-orange-600 dark:text-orange-400',
        dot: 'bg-orange-500',
      };
    case 'blush pink':
    case 'electrical':
    case 'tailoring':
    case 'housekeeping':
      return {
        bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
        text: 'text-indigo-600 dark:text-indigo-400',
        dot: 'bg-indigo-500',
      };
    case 'yellow':
    case 'stationery':
    case 'repairs':
      return {
        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
      };
    case 'coral':
    case 'emergency':
    case 'urgent':
      return {
        bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
        text: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
      };
    default:
      return {
        bg: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20',
        text: 'text-gray-600 dark:text-gray-400',
        dot: 'bg-gray-400',
      };
  }
}

/**
 * Converts Indian Rupee number to words (e.g. 1450 -> 'One Thousand Four Hundred Fifty Rupees Only')
 */
export function numberToWordsINR(num: number): string {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n === 0) return '';
    if (n < 20) return a[n] + ' ';
    if (n < 100) return b[Math.floor(n / 10)] + ' ' + (a[n % 10] ? a[n % 10] + ' ' : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred ' + inWords(n % 100);
    if (n < 100000) return inWords(Math.floor(n / 1000)).trim() + ' Thousand ' + inWords(n % 1000);
    if (n < 10000000) return inWords(Math.floor(n / 100000)).trim() + ' Lakh ' + inWords(n % 100000);
    return inWords(Math.floor(n / 10000000)).trim() + ' Crore ' + inWords(n % 10000000);
  }

  const rounded = Math.round(num);
  const result = inWords(rounded).replace(/\s+/g, ' ').trim();
  return `${result} Rupees Only`;
}

/**
 * Generates an 80mm ESC/POS formatted thermal voucher slip and triggers print window
 */
export function printThermalVoucherSlip(voucher: {
  voucher_number: string;
  branch_code?: string | null;
  payment_date: string;
  total_amount: number;
  recipient_name: string;
  category_name?: string | null;
  department_name?: string | null;
  payment_method?: string | null;
  remarks?: string | null;
  created_by_name?: string | null;
  status?: string | null;
}) {
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    console.warn('Popup blocked: Unable to open print window for ESC/POS thermal voucher slip.');
    return;
  }

  const words = numberToWordsINR(voucher.total_amount);
  const formattedDate = formatDate(voucher.payment_date, 'dd-MMM-yyyy');
  const printTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  function escapeHtml(str: string | null | undefined): string {
    return String(str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m] || m));
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Voucher_${escapeHtml(voucher.voucher_number)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 3mm;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 72mm;
      margin: 0 auto;
      padding: 2mm;
      color: #000;
      font-size: 11px;
      line-height: 1.25;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .title { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
    .subtitle { font-size: 10px; margin-top: 2px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 0; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .row-label { font-weight: bold; width: 45%; }
    .row-val { width: 55%; text-align: right; word-break: break-word; }
    .amount-box {
      border: 1.5px solid #000;
      padding: 6px;
      margin: 6px 0;
      text-align: center;
    }
    .amount-val { font-size: 16px; font-weight: bold; }
    .words { font-size: 9.5px; font-style: italic; margin-top: 3px; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 24px; }
    .sign-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 3px; font-size: 9px; font-weight: bold; }
    .seal-box { border: 1px dashed #000; padding: 8px; margin-top: 12px; text-align: center; font-size: 9px; }
    .footer { font-size: 8.5px; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="title">Asopalav Silk Mills</div>
    <div class="subtitle">Luxury Ethnic Wear & Couture</div>
    <div class="subtitle">Showroom: ${escapeHtml(voucher.branch_code || 'Satellite')}</div>
  </div>

  <div class="double-divider text-center bold">
    Payment Expense Voucher
  </div>

  <div class="row"><span class="row-label">Voucher No:</span><span class="row-val bold">${escapeHtml(voucher.voucher_number)}</span></div>
  <div class="row"><span class="row-label">Date & Time:</span><span class="row-val">${formattedDate} ${printTime}</span></div>
  <div class="row"><span class="row-label">Status:</span><span class="row-val bold">${escapeHtml(voucher.status || 'Approved')}</span></div>

  <div class="divider"></div>

  <div class="row"><span class="row-label">Paid To:</span><span class="row-val bold">${escapeHtml(voucher.recipient_name)}</span></div>
  <div class="row"><span class="row-label">Category:</span><span class="row-val">${escapeHtml(voucher.category_name || 'Expense')}</span></div>
  <div class="row"><span class="row-label">Department:</span><span class="row-val">${escapeHtml(voucher.department_name || 'Showroom')}</span></div>
  <div class="row"><span class="row-label">Pay Mode:</span><span class="row-val">${voucher.payment_method === 'Online_UPI' ? 'Online / UPI / Bank' : 'Physical Cash'}</span></div>

  <div class="divider"></div>

  <div style="font-size: 10px;"><strong>Particulars:</strong> ${escapeHtml(voucher.remarks || 'General expense')}</div>

  <div class="amount-box">
    <div>Total Paid Amount</div>
    <div class="amount-val">INR ${Number(voucher.total_amount).toFixed(2)}</div>
    <div class="words">(${words})</div>
  </div>

  <div class="sign-row">
    <div class="sign-box">Cashier Signature<br><span style="font-weight:normal; font-size:8px;">${escapeHtml(voucher.created_by_name || 'Cashier')}</span></div>
    <div class="sign-box">Receiver Signature<br><span style="font-weight:normal; font-size:8px;">${escapeHtml(voucher.recipient_name)}</span></div>
  </div>

  <div class="seal-box">
    [ Store Manager Verification & Seal ]
  </div>

  <div class="footer">
    Double-Entry Synchronized • Asopalav ERP
  </div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 750);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Generates an 80mm ESC/POS formatted Daily Cash Closing EOD Audit Slip
 */
export function printThermalClosingSlip(closing: {
  branchCode: string;
  closingDate: string;
  openingCash: number;
  cashInflow: number;
  cashOutflow: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  denominationsBreakdown: Record<number, number>;
  cashierName: string;
  verifiedByName: string;
  notes?: string;
}) {
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    console.warn('Popup blocked: Unable to open print window for ESC/POS thermal closing slip.');
    return;
  }

  const formattedDate = formatDate(closing.closingDate, 'dd-MMM-yyyy');
  const printTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const denomRows = [500, 200, 100, 50, 20, 10, 5, 2, 1]
    .map((val) => {
      const count = closing.denominationsBreakdown[val] || 0;
      if (count === 0) return '';
      return `<div class="row"><span>₹${val} x ${count}</span><span>₹${(val * count).toFixed(2)}</span></div>`;
    })
    .filter(Boolean)
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EOD_Closing_${closing.branchCode}_${closing.closingDate}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 72mm;
      margin: 0 auto;
      padding: 2mm;
      color: #000;
      font-size: 11px;
      line-height: 1.25;
      background: #fff;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
    .subtitle { font-size: 10px; margin-top: 2px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 0; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .amount-box { border: 1.5px solid #000; padding: 6px; margin: 6px 0; text-align: center; }
    .amount-val { font-size: 15px; font-weight: bold; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 24px; }
    .sign-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 3px; font-size: 9px; font-weight: bold; }
    .footer { font-size: 8.5px; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="title">ASOPALAV SILK MILLS</div>
    <div class="subtitle">EOD CASH CLOSING AUDIT</div>
    <div class="subtitle">Showroom: ${closing.branchCode}</div>
  </div>

  <div class="double-divider text-center bold">
    DAILY TILL AUDIT REGISTER
  </div>

  <div class="row"><span>Date & Time:</span><span class="bold">${formattedDate} ${printTime}</span></div>
  <div class="row"><span>Cashier:</span><span>${closing.cashierName}</span></div>
  <div class="row"><span>Manager Sign-off:</span><span>${closing.verifiedByName}</span></div>

  <div class="divider"></div>

  <div class="row"><span>Opening + Float In:</span><span>₹${closing.openingCash + closing.cashInflow}</span></div>
  <div class="row"><span>Cash Outflow:</span><span>₹${closing.cashOutflow}</span></div>
  <div class="row"><span>Expected in Till:</span><span class="bold">₹${closing.expectedCash}</span></div>

  <div class="divider"></div>
  <div class="bold" style="font-size: 10px;">PHYSICAL DENOMINATION COUNT:</div>
  ${denomRows || '<div class="row"><span>Zero count closing</span><span>₹0</span></div>'}

  <div class="amount-box">
    <div>PHYSICAL COUNTED CASH</div>
    <div class="amount-val">INR ${closing.actualCash.toFixed(2)}</div>
    <div style="font-size: 10px; margin-top: 3px;">
      VARIANCE: <strong>${closing.variance === 0 ? 'ZERO (MATCHED)' : closing.variance < 0 ? 'SHORTAGE -₹' + Math.abs(closing.variance) : 'SURPLUS +₹' + closing.variance}</strong>
    </div>
  </div>

  ${closing.notes ? `<div style="font-size: 9.5px; margin-top: 4px;"><strong>Notes:</strong> ${closing.notes}</div>` : ''}

  <div class="sign-row">
    <div class="sign-box">Cashier Sign<br><span style="font-weight:normal; font-size:8px;">${closing.cashierName}</span></div>
    <div class="sign-box">Manager Sign<br><span style="font-weight:normal; font-size:8px;">${closing.verifiedByName}</span></div>
  </div>

  <div class="footer">
    Verified & Locked • Asopalav ERP v2.4
  </div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 750);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export type HapticFeedbackType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

/**
 * Emits tactile haptic vibration patterns ONLY on mobile & tablet touch devices.
 * Completely disabled on desktop devices.
 */
export function triggerHaptic(type: HapticFeedbackType = 'light') {
  if (typeof window === 'undefined' || !window.navigator || !('vibrate' in window.navigator)) {
    return;
  }

  // Only trigger on mobile / tablet touch devices (width < 1024px or coarse touch pointer)
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileOrTablet = window.innerWidth < 1024 || (isTouch && window.matchMedia('(pointer: coarse)').matches);

  if (!isTouch || !isMobileOrTablet) {
    return;
  }

  try {
    switch (type) {
      case 'selection':
      case 'light':
        window.navigator.vibrate(10);
        break;
      case 'medium':
        window.navigator.vibrate(22);
        break;
      case 'heavy':
        window.navigator.vibrate(40);
        break;
      case 'success':
        window.navigator.vibrate([12, 40, 20]);
        break;
      case 'warning':
        window.navigator.vibrate([25, 30, 25]);
        break;
      case 'error':
        window.navigator.vibrate([35, 40, 35, 40, 35]);
        break;
      default:
        window.navigator.vibrate(10);
        break;
    }
  } catch {
    // Graceful fallback for non-supported browsers
  }
}
