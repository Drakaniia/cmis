I don’t understand why, when I click **“Check Server”** in the Status tab of the Cloud Sync settings, the `inventory_items` count shows 85, but when I navigate to the Stock Management page, the inventory is empty or doesn’t display the actual data.

Also, when I enable **“Sync Automatically”** in the Cloud Sync settings, there should be a confirmation message or modal warning the user: “Records already exist on this device. Are you sure you want to sync?”

The Cloud Sync feature is not yet fully implemented and does not handle all edge cases properly. For example, when the device already contains existing data while the actual or latest data is stored in the Cloudflare database, this scenario is not handled correctly.

Please review the Cloud Sync functionality to ensure that existing local data and cloud data are handled properly, with appropriate confirmation prompts to prevent accidental data overwrites or inconsistencies.


batch slot in the input in batch shold be automatic when no input (automatic input batch fefo code similar to the step 1 wizard when stock in barcode/sku)

when i ctrl + k and search for item details,  add button to the modal that will open new request  for that stock


is by batch is recorded monthly when dispensing?


in Alert Threshold, global defaults, add also option for warning, separate if red or orange, in the expiry window,  not jsut that 3 radio buttons, and make sure its real settings that is used in the alert page and low stock page


add request button UI in the Home page. (or add indicator ctrl + k)

in the new request modal, only show the red validation"quantity must be whole number greater than zero"  if i click the create request.  not after i click a medecine that it shows directly


should be no date selector in the moth selector in the stock report, it should only be month and year date picker


full implimentation for the  app name in settings "General".

the "remove" button button when adding inventory batch