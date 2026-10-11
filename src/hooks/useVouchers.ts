import { useEffect, useCallback } from 'react';
import { useBranchStore } from '@/store/branchStore';
import { useVoucherStore } from '@/store/voucherStore';

export function useVouchers() {
  const { selectedBranchId, fetchBranchesAndWallets } = useBranchStore();
  const {
    vouchers: vouchersByBranch,
    masterData,
    loadingVouchers,
    loadingMaster,
    fetchMasterData,
    fetchVouchers,
    invalidateVouchers,
    invalidateMasterData,
  } = useVoucherStore();

  const currentBranchKey = selectedBranchId || 'ALL';
  const vouchers = vouchersByBranch[currentBranchKey] || [];
  const loading = loadingVouchers || loadingMaster;

  // Initial load with smart cache verification
  useEffect(() => {
    fetchMasterData();
    fetchVouchers(currentBranchKey);
    fetchBranchesAndWallets();

    const handleMasterUpdate = () => {
      fetchMasterData(true);
    };
    const handleVouchersUpdate = () => {
      fetchVouchers(currentBranchKey, true);
    };

    window.addEventListener('asopalav:master-data-updated', handleMasterUpdate);
    window.addEventListener('asopalav:vouchers-updated', handleVouchersUpdate);
    return () => {
      window.removeEventListener('asopalav:master-data-updated', handleMasterUpdate);
      window.removeEventListener('asopalav:vouchers-updated', handleVouchersUpdate);
    };
  }, [currentBranchKey, fetchMasterData, fetchVouchers, fetchBranchesAndWallets]);

  // Force refresh action (e.g. after adding voucher or CSV import)
  const refresh = useCallback(
    async (force = true) => {
      if (force) {
        invalidateVouchers(currentBranchKey);
        invalidateMasterData();
      }
      await Promise.all([
        fetchMasterData(force),
        fetchVouchers(currentBranchKey, force),
        fetchBranchesAndWallets(force),
      ]);
    },
    [currentBranchKey, fetchMasterData, fetchVouchers, fetchBranchesAndWallets, invalidateVouchers, invalidateMasterData]
  );

  return {
    vouchers,
    categories: masterData.categories,
    departments: masterData.departments,
    couriers: masterData.couriers,
    staff: masterData.staff,
    loading,
    refresh,
  };
}
