package com.kreativekoala.audexa.ui.subscription

import android.app.Activity
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PackageType
import com.revenuecat.purchases.models.StoreProduct
import com.revenuecat.purchases.ui.revenuecatui.PaywallDialog
import com.revenuecat.purchases.ui.revenuecatui.PaywallDialogOptions
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    billingManager: BillingManager,
    onNavigateBack: () -> Unit
) {
    // Try RevenueCat remote paywall first (design controlled from dashboard)
    var showRemotePaywall by remember { mutableStateOf(true) }

    if (showRemotePaywall) {
        PaywallDialog(
            PaywallDialogOptions.Builder()
                .setDismissRequest {
                    showRemotePaywall = false
                    onNavigateBack()
                }
                .build()
        )
    }
}

// Fallback custom paywall (kept for reference or if remote paywall is not configured)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomPaywallScreen(
    billingManager: BillingManager,
    onNavigateBack: () -> Unit
) {
    val packages by billingManager.packages.collectAsState()
    val isSubscribed by billingManager.isSubscribed.collectAsState()
    val purchaseInProgress by billingManager.purchaseInProgress.collectAsState()
    val context = LocalContext.current

    val monthlyPackage = packages.find { it.packageType == PackageType.MONTHLY }
    val yearlyPackage = packages.find { it.packageType == PackageType.ANNUAL }

    var selectedPackage by remember(packages) {
        mutableStateOf(yearlyPackage ?: monthlyPackage)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Close",
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(16.dp))

            // Header
            Text(
                text = "Go Ad-Free",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Enjoy uninterrupted listening",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Features
            FeatureRow(icon = Icons.Default.MusicOff, text = "No audio ad interruptions")
            Spacer(modifier = Modifier.height(12.dp))
            FeatureRow(icon = Icons.Default.Speed, text = "Seamless episode playback")
            Spacer(modifier = Modifier.height(12.dp))
            FeatureRow(icon = Icons.Default.Favorite, text = "Support indie development")

            Spacer(modifier = Modifier.height(32.dp))

            if (isSubscribed) {
                // Already subscribed
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = AccentOrange.copy(alpha = 0.15f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = AccentOrange,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "You're an Ad-Free subscriber!",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            } else {
                // Pricing cards
                if (yearlyPackage != null) {
                    PricingCard(
                        pkg = yearlyPackage,
                        label = "Yearly",
                        badge = "Save 58%",
                        isSelected = selectedPackage == yearlyPackage,
                        onClick = { selectedPackage = yearlyPackage }
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (monthlyPackage != null) {
                    PricingCard(
                        pkg = monthlyPackage,
                        label = "Monthly",
                        badge = null,
                        isSelected = selectedPackage == monthlyPackage,
                        onClick = { selectedPackage = monthlyPackage }
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Subscribe button
                Button(
                    onClick = {
                        selectedPackage?.let { pkg ->
                            (context as? Activity)?.let { activity ->
                                billingManager.launchPurchaseFlow(activity, pkg)
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                    enabled = selectedPackage != null && !purchaseInProgress
                ) {
                    if (purchaseInProgress) {
                        CircularProgressIndicator(
                            color = PrimaryTextDark,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Subscribe",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = PrimaryTextDark
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Restore purchases
                TextButton(onClick = { billingManager.restorePurchases() }) {
                    Text(
                        text = "Restore Purchases",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Fine print
                Text(
                    text = "Payment will be charged to your Google Play account. " +
                        "Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    lineHeight = 16.sp
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun FeatureRow(icon: ImageVector, text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = AccentOrange,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(16.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}

@Composable
private fun PricingCard(
    pkg: Package,
    label: String,
    badge: String?,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val product = pkg.product
    val price = product.price.formatted
    val periodLabel = when (pkg.packageType) {
        PackageType.ANNUAL -> "/year"
        PackageType.MONTHLY -> "/month"
        PackageType.WEEKLY -> "/week"
        else -> ""
    }

    val borderColor = if (isSelected) AccentOrange else MaterialTheme.colorScheme.surfaceVariant

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(2.dp, borderColor, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        color = if (isSelected) AccentOrange.copy(alpha = 0.08f)
        else MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = isSelected,
                onClick = onClick,
                colors = RadioButtonDefaults.colors(
                    selectedColor = AccentOrange,
                    unselectedColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    if (badge != null) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = AccentOrange
                        ) {
                            Text(
                                text = badge,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = PrimaryTextDark,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }

            Text(
                text = "$price$periodLabel",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) AccentOrange else MaterialTheme.colorScheme.onBackground
            )
        }
    }
}
