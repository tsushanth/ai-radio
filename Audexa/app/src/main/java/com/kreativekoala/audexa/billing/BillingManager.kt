package com.kreativekoala.audexa.billing

import android.app.Activity
import android.content.Context
import android.util.Log
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.Offerings
import com.revenuecat.purchases.getOfferingsWith
import com.revenuecat.purchases.interfaces.LogInCallback
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback
import com.revenuecat.purchases.purchaseWith
import com.revenuecat.purchases.restorePurchasesWith
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager
) {

    companion object {
        private const val TAG = "BillingManager"
        const val MONTHLY_PRODUCT_ID = "audexa_premium_monthly"
        const val YEARLY_PRODUCT_ID = "audexa_premium_yearly"
        const val ENTITLEMENT_ID = "premium"
        const val FREE_OPEN_LIMIT = 3
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _isSubscribed = MutableStateFlow(false)
    val isSubscribed: StateFlow<Boolean> = _isSubscribed.asStateFlow()

    private val _packages = MutableStateFlow<List<Package>>(emptyList())
    val packages: StateFlow<List<Package>> = _packages.asStateFlow()

    private val _purchaseInProgress = MutableStateFlow(false)
    val purchaseInProgress: StateFlow<Boolean> = _purchaseInProgress.asStateFlow()

    init {
        // Load cached subscription status immediately
        scope.launch {
            preferencesManager.isSubscribed.collect { cached ->
                _isSubscribed.value = cached
            }
        }
        // Delay initial fetch slightly to ensure RevenueCat SDK is fully configured
        scope.launch {
            delay(500)
            fetchOfferings()
            checkSubscriptionStatus()
        }
    }

    fun fetchOfferings() {
        Purchases.sharedInstance.getOfferingsWith(
            onError = { error ->
                Log.w(TAG, "Failed to fetch offerings: ${error.message}")
                // Retry after a delay
                if (_packages.value.isEmpty()) {
                    scope.launch {
                        delay(3000)
                        fetchOfferings()
                    }
                }
            },
            onSuccess = { offerings ->
                extractPackages(offerings)
                // If still empty, retry once more after delay
                if (_packages.value.isEmpty()) {
                    scope.launch {
                        delay(2000)
                        Purchases.sharedInstance.getOfferingsWith(
                            onError = { },
                            onSuccess = { retryOfferings -> extractPackages(retryOfferings) }
                        )
                    }
                }
            }
        )
    }

    private fun extractPackages(offerings: Offerings) {
        // Try current offering first
        val currentOffering = offerings.current
        if (currentOffering != null && currentOffering.availablePackages.isNotEmpty()) {
            _packages.value = currentOffering.availablePackages
            Log.d(TAG, "Found ${currentOffering.availablePackages.size} packages in current offering")
            return
        }

        // Fallback: try "default" offering by lookup key
        val defaultOffering = offerings["default"]
        if (defaultOffering != null && defaultOffering.availablePackages.isNotEmpty()) {
            _packages.value = defaultOffering.availablePackages
            Log.d(TAG, "Found ${defaultOffering.availablePackages.size} packages in 'default' offering")
            return
        }

        // Fallback: use first offering that has packages
        for ((key, offering) in offerings.all) {
            if (offering.availablePackages.isNotEmpty()) {
                _packages.value = offering.availablePackages
                Log.d(TAG, "Found ${offering.availablePackages.size} packages in '$key' offering")
                return
            }
        }

        Log.w(TAG, "No offerings with packages found. Available offerings: ${offerings.all.keys}")
    }

    private fun checkSubscriptionStatus() {
        Purchases.sharedInstance.getCustomerInfo(
            callback = object : ReceiveCustomerInfoCallback {
                override fun onReceived(customerInfo: CustomerInfo) {
                    val hasEntitlement = customerInfo.entitlements[ENTITLEMENT_ID]?.isActive == true
                    updateSubscriptionStatus(hasEntitlement)
                }

                override fun onError(error: PurchasesError) {
                    Log.w(TAG, "Failed to check subscription: ${error.message}")
                }
            }
        )
    }

    fun launchPurchaseFlow(activity: Activity, pkg: Package) {
        _purchaseInProgress.value = true

        Purchases.sharedInstance.purchaseWith(
            purchaseParams = PurchaseParams.Builder(activity, pkg).build(),
            onError = { error, userCancelled ->
                _purchaseInProgress.value = false
                if (userCancelled) {
                    Log.d(TAG, "Purchase cancelled by user")
                } else {
                    Log.w(TAG, "Purchase failed: ${error.message}")
                }
            },
            onSuccess = { _, customerInfo ->
                _purchaseInProgress.value = false
                val hasEntitlement = customerInfo.entitlements[ENTITLEMENT_ID]?.isActive == true
                updateSubscriptionStatus(hasEntitlement)
                Log.d(TAG, "Purchase successful, premium=$hasEntitlement")
            }
        )
    }

    fun restorePurchases() {
        Purchases.sharedInstance.restorePurchasesWith(
            onError = { error ->
                Log.w(TAG, "Restore failed: ${error.message}")
            },
            onSuccess = { customerInfo ->
                val hasEntitlement = customerInfo.entitlements[ENTITLEMENT_ID]?.isActive == true
                updateSubscriptionStatus(hasEntitlement)
                Log.d(TAG, "Restore completed, premium=$hasEntitlement")
            }
        )
    }

    fun identifyUser(userId: String) {
        Purchases.sharedInstance.logIn(
            newAppUserID = userId,
            callback = object : LogInCallback {
                override fun onReceived(customerInfo: CustomerInfo, created: Boolean) {
                    val hasEntitlement = customerInfo.entitlements[ENTITLEMENT_ID]?.isActive == true
                    updateSubscriptionStatus(hasEntitlement)
                    Log.d(TAG, "Identified user $userId, premium=$hasEntitlement, new=$created")
                }

                override fun onError(error: PurchasesError) {
                    Log.w(TAG, "Failed to identify user: ${error.message}")
                }
            }
        )
    }

    fun logOut() {
        Purchases.sharedInstance.logOut()
        updateSubscriptionStatus(false)
    }

    private fun updateSubscriptionStatus(subscribed: Boolean) {
        _isSubscribed.value = subscribed
        scope.launch {
            preferencesManager.setSubscribed(subscribed)
        }
    }

    fun destroy() {
        scope.cancel()
    }
}
