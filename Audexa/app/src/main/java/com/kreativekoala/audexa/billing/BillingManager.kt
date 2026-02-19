package com.kreativekoala.audexa.billing

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.*
import com.kreativekoala.audexa.data.local.PreferencesManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "BillingManager"
        const val MONTHLY_PRODUCT_ID = "audexa_premium_monthly"
        const val YEARLY_PRODUCT_ID = "audexa_premium_yearly"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _isSubscribed = MutableStateFlow(false)
    val isSubscribed: StateFlow<Boolean> = _isSubscribed.asStateFlow()

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    private val _purchaseInProgress = MutableStateFlow(false)
    val purchaseInProgress: StateFlow<Boolean> = _purchaseInProgress.asStateFlow()

    private var billingClient: BillingClient? = null

    init {
        // Load cached subscription status immediately
        scope.launch {
            preferencesManager.isSubscribed.collect { cached ->
                _isSubscribed.value = cached
            }
        }
        startConnection()
    }

    private fun startConnection() {
        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases()
            .build()

        billingClient?.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Billing connected")
                    scope.launch {
                        queryProducts()
                        queryExistingPurchases()
                    }
                } else {
                    Log.w(TAG, "Billing setup failed: ${result.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing disconnected — will retry on next operation")
            }
        })
    }

    private suspend fun queryProducts() {
        val client = billingClient ?: return

        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(MONTHLY_PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(YEARLY_PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        val result = client.queryProductDetails(params)

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _products.value = result.productDetailsList ?: emptyList()
            Log.d(TAG, "Found ${_products.value.size} products")
        } else {
            Log.w(TAG, "Failed to query products: ${result.billingResult.debugMessage}")
        }
    }

    private suspend fun queryExistingPurchases() {
        val client = billingClient ?: return

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        val result = client.queryPurchasesAsync(params)

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            val hasActiveSub = result.purchasesList.any { purchase ->
                purchase.purchaseState == Purchase.PurchaseState.PURCHASED &&
                    purchase.isAcknowledged
            }

            // Also handle un-acknowledged purchases
            for (purchase in result.purchasesList) {
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED && !purchase.isAcknowledged) {
                    acknowledgePurchase(purchase)
                }
            }

            updateSubscriptionStatus(
                hasActiveSub || result.purchasesList.any {
                    it.purchaseState == Purchase.PurchaseState.PURCHASED
                }
            )
        }
    }

    fun launchPurchaseFlow(activity: Activity, productDetails: ProductDetails) {
        val client = billingClient ?: return

        val offerToken = productDetails.subscriptionOfferDetails
            ?.firstOrNull()?.offerToken ?: return

        val productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken)
            .build()

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParams))
            .build()

        _purchaseInProgress.value = true
        client.launchBillingFlow(activity, billingFlowParams)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        _purchaseInProgress.value = false

        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.forEach { purchase ->
                    scope.launch { handlePurchase(purchase) }
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.d(TAG, "Purchase cancelled by user")
            }
            else -> {
                Log.w(TAG, "Purchase failed: ${result.debugMessage}")
            }
        }
    }

    private suspend fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged) {
                acknowledgePurchase(purchase)
            }
            updateSubscriptionStatus(true)

            // Server-side verification (fire-and-forget)
            verifyWithBackend(purchase)
        }
    }

    private suspend fun acknowledgePurchase(purchase: Purchase) {
        val client = billingClient ?: return

        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        val result = client.acknowledgePurchase(params)
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
            Log.d(TAG, "Purchase acknowledged")
        } else {
            Log.w(TAG, "Failed to acknowledge: ${result.debugMessage}")
        }
    }

    private suspend fun verifyWithBackend(purchase: Purchase) {
        // TODO: Call POST /api/subscription/verify-android with purchaseToken
        // For now, trust the client-side purchase state
        Log.d(TAG, "TODO: Verify purchase with backend (token: ${purchase.purchaseToken.take(20)}...)")
    }

    fun restorePurchases() {
        scope.launch {
            queryExistingPurchases()
        }
    }

    private fun updateSubscriptionStatus(subscribed: Boolean) {
        _isSubscribed.value = subscribed
        scope.launch {
            preferencesManager.setSubscribed(subscribed)
        }
    }

    fun destroy() {
        billingClient?.endConnection()
        billingClient = null
        scope.cancel()
    }
}
