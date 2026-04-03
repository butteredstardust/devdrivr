# ThingWorx JavaScript Snippets Collection

Copy the JSON array below and paste into the Snippets Manager import (F10).

> **Note:** Uses ES5 syntax compatible with Rhino 1.7.11 (no arrow functions, let/const, etc.)

```json
[
  {
    "title": "Create InfoTable from DataShape",
    "content": "// Create an empty InfoTable from an existing DataShape\nvar params = {\n    infoTableName: \"MyInfoTable\",\n    dataShapeName: \"MyDataShape\"\n};\nvar result = Resources[\"InfoTableFunctions\"].CreateInfoTableFromDataShape(params);",
    "language": "javascript",
    "tags": ["infotable", "create"]
  },
  {
    "title": "Create InfoTable with Fields",
    "content": "// Create an InfoTable with inline field definitions\nvar result = Resources[\"InfoTableFunctions\"].CreateInfoTable();\nresult.AddField({ name: \"id\", baseType: \"INTEGER\" });\nresult.AddField({ name: \"name\", baseType: \"STRING\" });\nresult.AddField({ name: \"value\", baseType: \"NUMBER\" });\nresult.AddField({ name: \"timestamp\", baseType: \"DATETIME\" });",
    "language": "javascript",
    "tags": ["infotable", "create"]
  },
  {
    "title": "Add Row to InfoTable",
    "content": "// Add a row to an existing InfoTable\nvar row = new Object();\nrow.id = 1;\nrow.name = \"Example\";\nrow.value = 42.5;\nrow.timestamp = new Date();\ninfoTable.AddRow(row);",
    "language": "javascript",
    "tags": ["infotable", "row"]
  },
  {
    "title": "Add Multiple Rows to InfoTable",
    "content": "// Add multiple rows from an array of objects\nvar data = [\n    { id: 1, name: \"Item A\", value: 100 },\n    { id: 2, name: \"Item B\", value: 200 },\n    { id: 3, name: \"Item C\", value: 300 }\n];\n\nfor (var i = 0; i < data.length; i++) {\n    var row = new Object();\n    row.id = data[i].id;\n    row.name = data[i].name;\n    row.value = data[i].value;\n    result.AddRow(row);\n}",
    "language": "javascript",
    "tags": ["infotable", "row", "loop"]
  },
  {
    "title": "Get InfoTable Row Count",
    "content": "// Get the number of rows in an InfoTable\nvar count = infoTable.getRowCount();\nlogger.debug(\"Row count: \" + count);",
    "language": "javascript",
    "tags": ["infotable", "query"]
  },
  {
    "title": "Get Field Value from Row",
    "content": "// Get a specific field value from a row by index\nvar rowIndex = 0;\nvar fieldValue = infoTable.getRow(rowIndex).fieldName;\n\n// Iterate all rows and get field\nfor (var i = 0; i < infoTable.getRowCount(); i++) {\n    var row = infoTable.getRow(i);\n    logger.debug(\"Row \" + i + \": \" + row.fieldName);\n}",
    "language": "javascript",
    "tags": ["infotable", "row", "query"]
  },
  {
    "title": "Find Row in InfoTable",
    "content": "// Find first row matching a condition\nvar foundRow = null;\nfor (var i = 0; i < infoTable.getRowCount(); i++) {\n    var row = infoTable.getRow(i);\n    if (row.id === targetId) {\n        foundRow = row;\n        break;\n    }\n}",
    "language": "javascript",
    "tags": ["infotable", "query", "search"]
  },
  {
    "title": "Filter InfoTable with Query",
    "content": "// Filter InfoTable using Query\nvar query = {\n    \"filters\": {\n        \"type\": \"AND\",\n        \"filters\": [\n            {\n                \"type\": \"EQ\",\n                \"fieldName\": \"status\",\n                \"value\": \"active\"\n            }\n        ]\n    }\n};\n\nvar params = {\n    t: sourceInfoTable,\n    query: query\n};\nvar result = Resources[\"InfoTableFunctions\"].Query(params);",
    "language": "javascript",
    "tags": ["infotable", "query", "filter"]
  },
  {
    "title": "Sort InfoTable",
    "content": "// Sort InfoTable by field\nvar params = {\n    sortType: \"ASC\",\n    t: infoTable,\n    sortColumn: \"timestamp\"\n};\nvar result = Resources[\"InfoTableFunctions\"].Sort(params);",
    "language": "javascript",
    "tags": ["infotable", "sort"]
  },
  {
    "title": "Delete Rows from InfoTable",
    "content": "// Delete rows matching a condition\nvar rowsToDelete = [];\nfor (var i = infoTable.getRowCount() - 1; i >= 0; i--) {\n    var row = infoTable.getRow(i);\n    if (row.status === \"deleted\") {\n        rowsToDelete.push(i);\n    }\n}\nfor (var j = rowsToDelete.length - 1; j >= 0; j--) {\n    infoTable.DeleteRow(rowsToDelete[j]);\n}",
    "language": "javascript",
    "tags": ["infotable", "delete"]
  },
  {
    "title": "Aggregate InfoTable",
    "content": "// Aggregate InfoTable (SUM, AVG, MIN, MAX, COUNT)\nvar params = {\n    t: infoTable,\n    column: \"value\",\n    aggregates: \"SUM,AVG,COUNT,MIN,MAX\",\n    groupByColumn: \"category\"\n};\nvar result = Resources[\"InfoTableFunctions\"].Aggregate(params);",
    "language": "javascript",
    "tags": ["infotable", "aggregate"]
  },
  {
    "title": "Get Thing Property Value",
    "content": "// Get a property value from a Thing\nvar thingName = \"MyThing\";\nvar propertyName = \"temperature\";\nvar value = Things[thingName][propertyName];",
    "language": "javascript",
    "tags": ["thing", "property"]
  },
  {
    "title": "Set Thing Property Value",
    "content": "// Set a property value on a Thing\nvar thingName = \"MyThing\";\nThings[thingName].temperature = 25.5;\n\n// Or with explicit write\nThings[thingName].SetPropertyValue({\n    propertyName: \"temperature\",\n    value: 25.5\n});",
    "language": "javascript",
    "tags": ["thing", "property"]
  },
  {
    "title": "Execute Thing Service",
    "content": "// Execute a service on a Thing with parameters\nvar params = {\n    param1: \"value1\",\n    param2: 100\n};\nvar result = Things[\"MyThing\"].MyService(params);\n\n// Execute service without parameters\nvar result = Things[\"MyThing\"].GetStatus();",
    "language": "javascript",
    "tags": ["thing", "service"]
  },
  {
    "title": "Query Named Property History",
    "content": "// Query property history from a Thing\nvar params = {\n    oldestFirst: true,\n    maxItems: 100,\n    propertyName: \"temperature\"\n};\nvar result = Things[\"MyThing\"].QueryNamedPropertyHistory(params);",
    "language": "javascript",
    "tags": ["thing", "history", "valuestream"]
  },
  {
    "title": "Add PropertyValueStream Entry",
    "content": "// Add a value stream entry directly\nvar params = {\n    propertyName: \"temperature\",\n    value: 22.5,\n    timestamp: new Date(),\n    quality: \"GOOD\"\n};\nThings[\"MyThing\"].AddPropertyValueStreamEntry(params);",
    "language": "javascript",
    "tags": ["thing", "valuestream", "history"]
  },
  {
    "title": "Query Property History with Date Range",
    "content": "// Query property history with date range\nvar startDate = new Date();\nstartDate.setDate(startDate.getDate() - 7);\nvar endDate = new Date();\n\nvar query = {\n    \"filters\": {\n        \"type\": \"AND\",\n        \"filters\": [\n            {\n                \"type\": \"GE\",\n                \"fieldName\": \"timestamp\",\n                \"value\": startDate\n            },\n            {\n                \"type\": \"LE\",\n                \"fieldName\": \"timestamp\",\n                \"value\": endDate\n            }\n        ]\n    }\n};\n\nvar params = {\n    oldestFirst: true,\n    maxItems: 1000,\n    query: query,\n    propertyName: \"temperature\"\n};\nvar result = Things[\"MyThing\"].QueryNamedPropertyHistory(params);",
    "language": "javascript",
    "tags": ["thing", "history", "query", "date"]
  },
  {
    "title": "Get All Property Definitions",
    "content": "// Get all property definitions for a Thing\nvar thingName = \"MyThing\";\nvar properties = Things[thingName].GetPropertyDefinitions({\n    entityType: \"Thing\"\n});\n",
    "language": "javascript",
    "tags": ["thing", "property", "metadata"]
  },
  {
    "title": "Logger Debug/Info/Error",
    "content": "// Logging at different levels\nlogger.debug(\"Debug message: \" + value);\nlogger.info(\"Info message: operation completed\");\nlogger.warn(\"Warning message: deprecated usage\");\nlogger.error(\"Error message: \" + errorDetails);\n",
    "language": "javascript",
    "tags": ["logging", "debug"]
  },
  {
    "title": "Try-Catch Error Handling",
    "content": "// Standard error handling pattern\ntry {\n    var result = Things[\"MyThing\"].GetStatus();\n    logger.info(\"Operation successful: \" + result);\n} catch (err) {\n    logger.error(\"Operation failed: \" + err);\n    var errorParams = {\n        errorMessage: err,\n        errorName: \"ServiceError\",\n        errorType: \"ServiceInvocationException\"\n    };\n    throw errorParams;\n}",
    "language": "javascript",
    "tags": ["error", "try-catch"]
  },
  {
    "title": "Iterate DataShape Fields",
    "content": "// Get DataShape fields and iterate\nvar dataShape = DataShapes[\"MyDataShape\"];\nvar fields = dataShape.GetFields();\n\nfor (var i = 0; i < fields.getRowCount(); i++) {\n    var field = fields.getRow(i);\n    logger.debug(\"Field: \" + field.name + \" Type: \" + field.baseType);\n}",
    "language": "javascript",
    "tags": ["datashape", "metadata"]
  },
  {
    "title": "Create DataShape Programmatically",
    "content": "// Create a DataShape with fields\nvar fieldsInfo = Resources[\"InfoTableFunctions\"].CreateInfoTable();\nfieldsInfo.AddField({ name: \"fieldName\", baseType: \"STRING\" });\nfieldsInfo.AddField({ name: \"baseType\", baseType: \"STRING\" });\n\nvar row = new Object();\nrow.fieldName = \"id\";\nrow.baseType = \"INTEGER\";\nfieldsInfo.AddRow(row);\n\nrow = new Object();\nrow.fieldName = \"name\";\nrow.baseType = \"STRING\";\nfieldsInfo.AddRow(row);\n\nvar params = {\n    name: \"MyNewDataShape\",\n    description: \"Auto-generated DataShape\",\n    fields: fieldsInfo\n};\nvar result = Resources[\"EntityServices\"].CreateDataShape(params);",
    "language": "javascript",
    "tags": ["datashape", "create", "metadata"]
  },
  {
    "title": "Clone InfoTable",
    "content": "// Create a deep copy of an InfoTable\nvar params = {\n    t: sourceInfoTable\n};\nvar result = Resources[\"InfoTableFunctions\"].Clone(params);",
    "language": "javascript",
    "tags": ["infotable", "clone"]
  },
  {
    "title": "Merge InfoTables",
    "content": "// Merge two InfoTables with same DataShape\nvar params = {\n    t1: infoTable1,\n    t2: infoTable2\n};\nvar result = Resources[\"InfoTableFunctions\"].Union(params);",
    "language": "javascript",
    "tags": ["infotable", "merge"]
  },
  {
    "title": "JSON to InfoTable Conversion",
    "content": "// Convert JSON array to InfoTable\nvar jsonData = '[{\"id\":1,\"name\":\"Item A\"},{\"id\":2,\"name\":\"Item B\"}]';\nvar parsed = JSON.parse(jsonData);\n\nvar result = Resources[\"InfoTableFunctions\"].CreateInfoTable();\nresult.AddField({ name: \"id\", baseType: \"INTEGER\" });\nresult.AddField({ name: \"name\", baseType: \"STRING\" });\n\nfor (var i = 0; i < parsed.length; i++) {\n    var row = new Object();\n    row.id = parsed[i].id;\n    row.name = parsed[i].name;\n    result.AddRow(row);\n}",
    "language": "javascript",
    "tags": ["infotable", "json", "conversion"]
  },
  {
    "title": "Get Thing Template Name",
    "content": "// Get the template name of a Thing\nvar thingName = \"MyThing\";\nvar thing = Things[thingName];\nvar templateName = thing.GetThingTemplate();\nlogger.info(\"Thing template: \" + templateName);",
    "language": "javascript",
    "tags": ["thing", "metadata", "template"]
  },
  {
    "title": "Query Things by Template",
    "content": "// Query all Things based on a specific template\nvar params = {\n    maxItems: 500,\n    nameMask: \"*\",\n    query: {\n        \"filters\": {\n            \"type\": \"EQ\",\n            \"fieldName\": \"thingTemplate\",\n            \"value\": \"MyTemplate\"\n        }\n    }\n};\nvar result = Resources[\"EntityServices\"].GetEntityList(params);",
    "language": "javascript",
    "tags": ["thing", "template", "query"]
  },
  {
    "title": "Iterate All Things of Type",
    "content": "// Iterate all Things of a specific template\nvar things = Resources[\"EntityServices\"].GetEntityListing({\n    maxItems: 1000,\n    type: \"Thing\",\n    filter: \"thingTemplate=MyTemplate\"\n});\n\nfor (var i = 0; i < things.getRowCount(); i++) {\n    var thingName = things.getRow(i).name;\n    logger.debug(\"Found thing: \" + thingName);\n    var value = Things[thingName].GetPropertyValues();\n}",
    "language": "javascript",
    "tags": ["thing", "template", "iterate"]
  },
  {
    "title": "Get All Thing Properties as InfoTable",
    "content": "// Get all property values as an InfoTable\nvar params = {\n    propertyNames: \"temperature,humidity,pressure\"\n};\nvar result = Things[\"MyThing\"].GetPropertyValues(params);\n\n// Iterate the result\nfor (var i = 0; i < result.getRowCount(); i++) {\n    var row = result.getRow(i);\n    logger.debug(row.name + \" = \" + row.value);\n}",
    "language": "javascript",
    "tags": ["thing", "property", "infotable"]
  },
  {
    "title": "Validate Required Parameters",
    "content": "// Validate that required input parameters exist\nfunction validateRequired(params, requiredFields) {\n    for (var i = 0; i < requiredFields.length; i++) {\n        var field = requiredFields[i];\n        if (params[field] === undefined || params[field] === null) {\n            throw \"Missing required parameter: \" + field;\n        }\n    }\n}\n\n// Usage\nvalidateRequired(params, [\"thingName\", \"propertyName\", \"value\"]);",
    "language": "javascript",
    "tags": ["validation", "utility"]
  },
  {
    "title": "Emit/Trigger Event",
    "content": "// Trigger an event on a Thing\nvar params = {\n    eventName: \"DataUpdated\",\n    eventData: {\n        source: \"MyService\",\n        timestamp: new Date(),\n        value: 42\n    }\n};\nThings[\"MyThing\"].ExecuteEvent(params);\n\n// Or directly\nThings[\"MyThing\"].DataUpdated();",
    "language": "javascript",
    "tags": ["thing", "event"]
  },
  {
    "title": "Get Current User",
    "content": "// Get the current authenticated user\nvar currentUser = Resources[\"EntityServices\"].GetCurrentUser();\nlogger.info(\"Current user: \" + currentUser);\n\n// Get user info\nvar userEntity = Users[currentUser];",
    "language": "javascript",
    "tags": ["security", "user"]
  },
  {
    "title": "Check User Permission",
    "content": "// Check if user has specific permission on a Thing\nvar params = {\n    resourceName: \"MyThing\",\n    resourceType: \"Thing\",\n    permission: \"PropertyRead\"\n};\nvar hasPermission = Resources[\"EntityServices\"].CheckPermission(params);\n\nif (!hasPermission) {\n    throw \"User does not have PropertyRead permission\";\n}",
    "language": "javascript",
    "tags": ["security", "permission"]
  },
  {
    "title": "Get User Organizations",
    "content": "// Get organizations for a user\nvar user = Users[\"myUser\"];\nvar orgs = user.GetOrganizations();\n\nfor (var i = 0; i < orgs.getRowCount(); i++) {\n    var org = orgs.getRow(i);\n    logger.debug(\"Organization: \" + org.name);\n}",
    "language": "javascript",
    "tags": ["security", "user", "organization"]
  },
  {
    "title": "Search Things by Tag",
    "content": "// Search Things by model tag\nvar params = {\n    maxItems: 500,\n    type: \"Thing\",\n    tags: \"Maintenance:Critical\"\n};\nvar result = Resources[\"EntityServices\"].GetEntityListByTag(params);\n\nfor (var i = 0; i < result.getRowCount(); i++) {\n    var thingName = result.getRow(i).name;\n    logger.debug(\"Tagged thing: \" + thingName);\n}",
    "language": "javascript",
    "tags": ["thing", "tag", "search"]
  },
  {
    "title": "Add Model Tag to Thing",
    "content": "// Add a model tag to a Thing\nvar params = {\n    tags: \"Maintenance:Critical\",\n    entityName: \"MyThing\",\n    entityType: \"Thing\"\n};\nResources[\"EntityServices\"].AddTag(params);",
    "language": "javascript",
    "tags": ["thing", "tag"]
  },
  {
    "title": "Remove Model Tag from Thing",
    "content": "// Remove a model tag from a Thing\nvar params = {\n    tags: \"Maintenance:Critical\",\n    entityName: \"MyThing\",\n    entityType: \"Thing\"\n};\nResources[\"EntityServices\"].DeleteTag(params);",
    "language": "javascript",
    "tags": ["thing", "tag"]
  },
  {
    "title": "Create Thing Programmatically",
    "content": "// Create a new Thing from a template\nvar params = {\n    name: \"MyNewThing\",\n    description: \"Auto-created Thing\",\n    thingTemplateName: \"MyTemplate\",\n    projectName: \"MyProject\"\n};\nResources[\"EntityServices\"].CreateThing(params);\n\n// Enable and restart the Thing\nThings[\"MyNewThing\"].EnableThing();\nThings[\"MyNewThing\"].RestartThing();",
    "language": "javascript",
    "tags": ["thing", "create", "entity"]
  },
  {
    "title": "Get Location Property",
    "content": "// Get location property (returns location object)\nvar location = Things[\"MyThing\"].location;\n\n// Access lat, lon, elevation\nvar lat = location.latitude;\nvar lon = location.longitude;\nvar elev = location.elevation;\nlogger.debug(\"Location: \" + lat + \", \" + lon + \", \" + elev);",
    "language": "javascript",
    "tags": ["thing", "property", "location"]
  },
  {
    "title": "Set Location Property",
    "content": "// Set location property on a Thing\nvar location = new Object();\nlocation.latitude = 37.7749;\nlocation.longitude = -122.4194;\nlocation.elevation = 10;\n\nThings[\"MyThing\"].SetPropertyValue({\n    propertyName: \"location\",\n    value: location\n});",
    "language": "javascript",
    "tags": ["thing", "property", "location"]
  },
  {
    "title": "Calculate Distance Between Locations",
    "content": "// Calculate distance between two geo points in meters\nvar loc1 = {\n    latitude: 37.7749,\n    longitude: -122.4194\n};\nvar loc2 = {\n    latitude: 34.0522,\n    longitude: -118.2437\n};\n\nvar params = {\n    fromLocation: loc1,\n    toLocation: loc2\n};\nvar distance = Resources[\"LocationServices\"].CalculateDistance(params);\n\nlogger.debug(\"Distance: \" + distance + \" meters\");",
    "language": "javascript",
    "tags": ["location", "calculation", "utility"]
  },
  {
    "title": "Get Alert Definitions",
    "content": "// Get all alert definitions from a Thing\nvar params = {\n    alertName: \"*\"  // Use * for all, or specific name\n};\nvar alerts = Things[\"MyThing\"].GetAlertDefinitions(params);\n\nfor (var i = 0; i < alerts.getRowCount(); i++) {\n    var alert = alerts.getRow(i);\n    logger.debug(\"Alert: \" + alert.name + \" - \" + alert.description);\n}",
    "language": "javascript",
    "tags": ["alert", "thing", "metadata"]
  },
  {
    "title": "Acknowledge Alert",
    "content": "// Acknowledge an alert\nvar params = {\n    alertName: \"HighTemperatureAlert\",\n    message: \"Alert acknowledged by operator\"\n};\nThings[\"MyThing\"].AcknowledgeAlert(params);",
    "language": "javascript",
    "tags": ["alert", "thing"]
  },
  {
    "title": "Get Stream Entries",
    "content": "// Query entries from a Stream\nvar params = {\n    maxItems: 1000,\n    source: \"MyThing\",\n    sourceType: \"Thing\"\n};\nvar result = Streams[\"MyStream\"].GetStreamEntries(params);\n\nfor (var i = 0; i < result.getRowCount(); i++) {\n    var entry = result.getRow(i);\n    logger.debug(\"Entry: \" + entry.timestamp + \" - \" + entry.value);\n}",
    "language": "javascript",
    "tags": ["stream", "query"]
  },
  {
    "title": "Add Stream Entry",
    "content": "// Add an entry to a Stream\nvar values = new Object();\nvalues.timestamp = new Date();\nvalues.source = \"MyService\";\nvalues.data = JSON.stringify({ key: \"value\" });\n\nvar params = {\n    sourceType: \"Thing\",\n    source: \"MyThing\",\n    values: values\n};\nStreams[\"MyStream\"].AddStreamEntry(params);",
    "language": "javascript",
    "tags": ["stream", "create"]
  },
  {
    "title": "Delete Stream Entries",
    "content": "// Delete entries from a Stream matching a query\nvar params = {\n    maxItems: 10000,\n    oldestFirst: true\n};\nStreams[\"MyStream\"].PurgeStreamEntries(params);",
    "language": "javascript",
    "tags": ["stream", "delete"]
  },
  {
    "title": "Read File from Repository",
    "content": "// Read a file from a File Repository\nvar params = {\n    path: \"/uploads/data.json\",\n    entityName: \"SystemRepository\"\n};\nvar fileContent = Resources[\"RepositoryFunctions\"].GetFileContent(params);\n\n// Parse JSON content\nvar data = JSON.parse(fileContent);",
    "language": "javascript",
    "tags": ["file", "repository"]
  },
  {
    "title": "Save File to Repository",
    "content": "// Save content to a file in a File Repository\nvar content = JSON.stringify({ id: 1, name: \"test\" });\n\nvar params = {\n    path: \"/exports/data.json\",\n    content: content,\n    entityName: \"SystemRepository\"\n};\nResources[\"RepositoryFunctions\"].SaveFileContent(params);",
    "language": "javascript",
    "tags": ["file", "repository"]
  },
  {
    "title": "Delete File from Repository",
    "content": "// Delete a file from a File Repository\nvar params = {\n    path: \"/uploads/old-file.json\",\n    entityName: \"SystemRepository\"\n};\nResources[\"RepositoryFunctions\"].DeleteFile(params);",
    "language": "javascript",
    "tags": ["file", "repository", "delete"]
  },
  {
    "title": "List Files in Repository",
    "content": "// List files in a repository directory\nvar params = {\n    path: \"/uploads\",\n    entityName: \"SystemRepository\"\n};\nvar files = Resources[\"RepositoryFunctions\"].GetFileListing(params);\n\nfor (var i = 0; i < files.getRowCount(); i++) {\n    var file = files.getRow(i);\n    logger.debug(\"File: \" + file.name + \" Size: \" + file.size);\n}",
    "language": "javascript",
    "tags": ["file", "repository"]
  },
  {
    "title": "InfoTable to CSV String",
    "content": "// Convert InfoTable to CSV string\nfunction infoTableToCSV(it) {\n    var rows = it.rows;\n    if (rows.getRowCount() === 0) return \"\";\n    \n    var fields = it.getDataShape().GetFields();\n    var headers = [];\n    for (var i = 0; i < fields.getRowCount(); i++) {\n        headers.push(fields.getRow(i).name);\n    }\n    \n    var csv = headers.join(\",\") + \"\\n\";\n    \n    for (var j = 0; j < rows.getRowCount(); j++) {\n        var row = rows.getRow(j);\n        var values = [];\n        for (var k = 0; k < headers.length; k++) {\n            var val = row[headers[k]];\n            values.push(val != null ? \"\\\"\" + val + \"\\\"\" : \"\");\n        }\n        csv += values.join(\",\") + \"\\n\";\n    }\n    return csv;\n}\n\nvar csvContent = infoTableToCSV(myInfoTable);",
    "language": "javascript",
    "tags": ["infotable", "csv", "conversion"]
  },
  {
    "title": "Get Config Table",
    "content": "// Get a configuration table from a Thing\nvar configTable = Things[\"MyThing\"].GetConfigurationTables();\n\nfor (var i = 0; i < configTable.getRowCount(); i++) {\n    var table = configTable.getRow(i);\n    logger.debug(\"Config table: \" + table.name);\n}",
    "language": "javascript",
    "tags": ["thing", "config"]
  },
  {
    "title": "Get/Set Persistent Property",
    "content": "// Get a persistent/logged property value\nvar params = {\n    propertyName: \"temperature\"\n};\nvar value = Things[\"MyThing\"].GetLoggedProperty(params);\n\n// Set a persistent property\nThings[\"MyThing\"].SetLoggedProperty({\n    propertyName: \"temperature\",\n    value: 25.5\n});",
    "language": "javascript",
    "tags": ["thing", "property", "persistent"]
  },
  {
    "title": "Remote Thing Connection Status",
    "content": "// Check if a Remote Thing is connected\nvar connected = Things[\"RemoteThingName\"].IsConnected();\n\nif (connected) {\n    logger.info(\"Remote thing is connected\");\n    // Sync properties\n    Things[\"RemoteThingName\"].UpdatePropertyValues({\n        properties: { temperature: 22.5 }\n    });\n} else {\n    logger.warn(\"Remote thing is not connected\");\n}",
    "language": "javascript",
    "tags": ["thing", "remote", "connection"]
  }
]
```

## Usage

1. Copy the JSON array above (just the array, not the markdown code fences)
2. Open Snippets Manager in devdrivr cockpit
3. Press **F10** or click **[F10: IMP]**
4. The snippets will be imported

## Snippet List

| #   | Title                                  | Tags                           |
| --- | -------------------------------------- | ------------------------------ |
| 1   | Create InfoTable from DataShape        | infotable, create              |
| 2   | Create InfoTable with Fields           | infotable, create              |
| 3   | Add Row to InfoTable                   | infotable, row                 |
| 4   | Add Multiple Rows to InfoTable         | infotable, row, loop           |
| 5   | Get InfoTable Row Count                | infotable, query               |
| 6   | Get Field Value from Row               | infotable, row, query          |
| 7   | Find Row in InfoTable                  | infotable, query, search       |
| 8   | Filter InfoTable with Query            | infotable, query, filter       |
| 9   | Sort InfoTable                         | infotable, sort                |
| 10  | Delete Rows from InfoTable             | infotable, delete              |
| 11  | Aggregate InfoTable                    | infotable, aggregate           |
| 12  | Get Thing Property Value               | thing, property                |
| 13  | Set Thing Property Value               | thing, property                |
| 14  | Execute Thing Service                  | thing, service                 |
| 15  | Query Named Property History           | thing, history, valuestream    |
| 16  | Add PropertyValueStream Entry          | thing, valuestream, history    |
| 17  | Query Property History with Date Range | thing, history, query, date    |
| 18  | Get All Property Definitions           | thing, property, metadata      |
| 19  | Logger Debug/Info/Error                | logging, debug                 |
| 20  | Try-Catch Error Handling               | error, try-catch               |
| 21  | Iterate DataShape Fields               | datashape, metadata            |
| 22  | Create DataShape Programmatically      | datashape, create, metadata    |
| 23  | Clone InfoTable                        | infotable, clone               |
| 24  | Merge InfoTables                       | infotable, merge               |
| 25  | JSON to InfoTable Conversion           | infotable, json, conversion    |
| 26  | Get Thing Template Name                | thing, metadata, template      |
| 27  | Query Things by Template               | thing, template, query         |
| 28  | Iterate All Things of Type             | thing, template, iterate       |
| 29  | Get All Thing Properties as InfoTable  | thing, property, infotable     |
| 30  | Validate Required Parameters           | validation, utility            |
| 31  | Emit/Trigger Event                     | thing, event                   |
| 32  | Get Current User                       | security, user                 |
| 33  | Check User Permission                  | security, permission           |
| 34  | Get User Organizations                 | security, user, organization   |
| 35  | Search Things by Tag                   | thing, tag, search             |
| 36  | Add Model Tag to Thing                 | thing, tag                     |
| 37  | Remove Model Tag from Thing            | thing, tag                     |
| 38  | Create Thing Programmatically          | thing, create, entity          |
| 39  | Get Location Property                  | thing, property, location      |
| 40  | Set Location Property                  | thing, property, location      |
| 41  | Calculate Distance Between Locations   | location, calculation, utility |
| 42  | Get Alert Definitions                  | alert, thing, metadata         |
| 43  | Acknowledge Alert                      | alert, thing                   |
| 44  | Get Stream Entries                     | stream, query                  |
| 45  | Add Stream Entry                       | stream, create                 |
| 46  | Delete Stream Entries                  | stream, delete                 |
| 47  | Read File from Repository              | file, repository               |
| 48  | Save File to Repository                | file, repository               |
| 49  | Delete File from Repository            | file, repository, delete       |
| 50  | List Files in Repository               | file, repository               |
| 51  | InfoTable to CSV String                | infotable, csv, conversion     |
| 52  | Get Config Table                       | thing, config                  |
| 53  | Get/Set Persistent Property            | thing, property, persistent    |
| 54  | Remote Thing Connection Status         | thing, remote, connection      |

## ThingWorx Rhino Compatibility Notes

- Uses `var` (not `let`/`const`)
- Uses `new Object()` for object creation
- Uses traditional `for` loops (no `for...of`)
- Uses `function` declarations (no arrow functions)
- `JSON.parse()` and `JSON.stringify()` are available in Rhino 1.7.11
