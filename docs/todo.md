I don’t understand why, when I click **“Check Server”** in the Status tab of the Cloud Sync settings, the `inventory_items` count shows 85, but when I navigate to the Stock Management page, the inventory is empty or doesn’t display the actual data.

Also, when I enable **“Sync Automatically”** in the Cloud Sync settings, there should be a confirmation message or modal warning the user: “Records already exist on this device. Are you sure you want to sync?”

The Cloud Sync feature is not yet fully implemented and does not handle all edge cases properly. For example, when the device already contains existing data while the actual or latest data is stored in the Cloudflare database, this scenario is not handled correctly.

Please review the Cloud Sync functionality to ensure that existing local data and cloud data are handled properly, with appropriate confirmation prompts to prevent accidental data overwrites or inconsistencies.
