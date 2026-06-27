<?php
/**
 * One-time setup: ensures admin password is Admin@2026
 * File: api/setup.php
 */

// 1. U sheeg browser-ka inuu filayo xog JSON ah
header('Content-Type: application/json');

// 2. Hubi in config.php uu sax yahay (ha ku jiro habka loo xiro database-ka)
require_once __DIR__ . '/config.php';

try {
    // 3. Waxaad u baahan tahay inaad hubiso in getDB() uu soo celinayo PDO object
    $pdo = getDB();
    
    // 4. Hash-ka password-ka (ha isticmaalin password-ka oo qaawan)
    $hash = password_hash('Admin@2026', PASSWORD_BCRYPT);

    // 5. Hubi haddii admin-ku hore u jiray
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND role = ?');
    $stmt->execute(['admin@certiwork.com', 'admin']);
    $admin = $stmt->fetch();

    if ($admin) {
        // Haddii uu jiro, cusboonaysii
        $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $update->execute([$hash, $admin['id']]);
        echo json_encode(['success' => true, 'message' => 'Admin password updated to Admin@2026']);
    } else {
        // Haddii uusan jirin, samee admin cusub
        $insert = $pdo->prepare(
            'INSERT INTO users (full_name, email, role, specialty, password_hash) VALUES (?, ?, ?, ?, ?)'
        );
        $insert->execute([
            'System Administrator',
            'admin@certiwork.com',
            'admin',
            'HR/Training Manager',
            $hash,
        ]);
        echo json_encode(['success' => true, 'message' => 'Admin user created with password Admin@2026']);
    }
} catch (PDOException $e) {
    // 6. Haddii ay jirto cilad database, soo celi JSON leh ciladda
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>